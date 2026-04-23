import { format } from "date-fns";
import type { FinanceOperation, LegalEntity, WarehouseInventoryRow } from "@/types/domain";

export type CloseDayResult = {
  operations: FinanceOperation[];
  totalAccruedRub: number;
  totalUnits: number;
  totalEntityCount: number;
};

type AccRow = { units: number; amountRub: number };

function byEntityAccrual(inv: WarehouseInventoryRow[]): Record<string, AccRow> {
  const acc: Record<string, AccRow> = {};
  for (const row of inv) {
    if (!acc[row.legalEntityId]) acc[row.legalEntityId] = { units: 0, amountRub: 0 };
    acc[row.legalEntityId].units += row.quantity;
    acc[row.legalEntityId].amountRub += row.quantity * row.tariffPerUnitDayRub;
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
  const map = byEntityAccrual(inv);
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
      comment: `Закрытие дня ${date}: хранение ${row.units} ед.`,
    }));

  return {
    operations: [...generated, ...financeOps],
    totalAccruedRub: generated.reduce((s, x) => s + x.amountRub, 0),
    totalUnits: Object.values(map).reduce((s, x) => s + x.units, 0),
    totalEntityCount: generated.length,
  };
}
