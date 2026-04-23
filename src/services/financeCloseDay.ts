import { format } from "date-fns";
import type { FinanceOperation, LegalEntity, WarehouseInventoryRow } from "@/types/domain";

export type CloseDayResult = {
  operations: FinanceOperation[];
  totalAccruedRub: number;
  totalUnits: number;
  totalEntityCount: number;
};

type AccRow = { units: number; volumeM3: number; pallets: number; amountRub: number; model: LegalEntity["storageModel"] };

function byEntityAccrual(inv: WarehouseInventoryRow[], legalEntities: LegalEntity[]): Record<string, AccRow> {
  const legalMap = new Map(legalEntities.map((x) => [x.id, x] as const));
  const acc: Record<string, AccRow> = {};
  for (const row of inv) {
    const legal = legalMap.get(row.legalEntityId);
    if (!legal) continue;
    if (!acc[row.legalEntityId]) {
      acc[row.legalEntityId] = { units: 0, volumeM3: 0, pallets: 0, amountRub: 0, model: legal.storageModel };
    }
    acc[row.legalEntityId].units += row.quantity;
    acc[row.legalEntityId].volumeM3 += row.occupiedVolumeM3;
    acc[row.legalEntityId].pallets += row.occupiedPallets;
    if (legal.storageModel === "by_volume") {
      acc[row.legalEntityId].amountRub += row.occupiedVolumeM3 * legal.tariffs.storagePerM3DayRub;
    } else {
      acc[row.legalEntityId].amountRub += row.occupiedPallets * legal.tariffs.storagePerPalletDayRub;
    }
  }
  return acc;
}

export function closeOperationalDay(
  financeOps: FinanceOperation[],
  inv: WarehouseInventoryRow[],
  legalEntities: LegalEntity[],
): CloseDayResult {
  const now = new Date();
  const date = format(now, "yyyy-MM-dd");
  const stamp = now.getTime();
  const map = byEntityAccrual(inv, legalEntities);
  const activeIds = new Set(legalEntities.filter((x) => x.isActive).map((x) => x.id));

  const generated: FinanceOperation[] = Object.entries(map)
    .filter(([id, row]) => activeIds.has(id) && row.units > 0)
    .map(([legalEntityId, row], idx) => ({
      id: `f-close-${stamp}-${idx}`,
      legalEntityId,
      date,
      kind: "хранение",
      marketplace: null,
      amountRub: Math.round(row.amountRub),
      comment:
        row.model === "by_volume"
          ? `Закрытие дня ${date}: хранение ${row.units} ед., ${row.volumeM3.toFixed(2)} м3`
          : `Закрытие дня ${date}: хранение ${row.units} ед., ${row.pallets.toFixed(2)} паллет`,
    }));

  return {
    operations: [...generated, ...financeOps],
    totalAccruedRub: generated.reduce((s, x) => s + x.amountRub, 0),
    totalUnits: Object.values(map).reduce((s, x) => s + x.units, 0),
    totalEntityCount: generated.length,
  };
}
