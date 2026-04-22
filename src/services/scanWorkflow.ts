import type { QueryClient } from "@tanstack/react-query";
import type { InboundSupply, LegalEntity, ShipmentBox, WarehouseInventoryRow } from "@/types/domain";
import { aggregateByLegalEntity, fetchMockWarehouseInventory } from "@/services/mockWarehouseInventory";
import { fetchMockInboundSupplies } from "@/services/mockReceiving";
import { fetchMockShipmentBoxes } from "@/services/mockWms";

export type ScanApplyResult =
  | { kind: "inbound_status"; message: string; documentNo: string }
  | { kind: "shipment_found"; message: string; barcode: string }
  | { kind: "inventory_status"; message: string; skuLabel: string }
  | { kind: "unknown"; message: string };

export function mergeLegalWarehouseCounts(legals: LegalEntity[], inv: WarehouseInventoryRow[]): LegalEntity[] {
  const agg = aggregateByLegalEntity(inv);
  return legals.map((e) => ({
    ...e,
    warehouseSkuCount: agg[e.id]?.warehouseSkuCount ?? 0,
    warehouseUnitsTotal: agg[e.id]?.warehouseUnitsTotal ?? 0,
  }));
}

/**
 * Применяет отсканированный код к демо-данным: приёмка (номер ПТ), короб отгрузки, баркод позиции склада.
 */
export async function applyScannedCodeToDemoState(code: string, qc: QueryClient): Promise<ScanApplyResult> {
  const raw = code.trim();
  if (!raw) return { kind: "unknown", message: "Пустой код" };

  const inbound =
    qc.getQueryData<InboundSupply[]>(["wms", "inbound"]) ?? (await fetchMockInboundSupplies());
  const hitIn = inbound.find((r) => r.documentNo === raw || r.id === raw);
  if (hitIn) {
    const next = inbound.map((r) =>
      r.id === hitIn.id && (r.status === "ожидается" || r.status === "частично")
        ? { ...r, status: "в обработке" as const }
        : r,
    );
    qc.setQueryData(["wms", "inbound"], next);
    return {
      kind: "inbound_status",
      message: `Приёмка ${hitIn.documentNo}: статус обновлён на «в обработке»`,
      documentNo: hitIn.documentNo,
    };
  }

  const boxes = qc.getQueryData<ShipmentBox[]>(["wms", "shipment-boxes"]) ?? (await fetchMockShipmentBoxes());
  const hitBox = boxes.find((b) => b.boxBarcode === raw);
  if (hitBox) {
    return { kind: "shipment_found", message: `Короб отгрузки: ${hitBox.boxBarcode}`, barcode: hitBox.boxBarcode };
  }

  let inv = qc.getQueryData<WarehouseInventoryRow[]>(["wms", "warehouse-inventory"]);
  if (!inv) {
    inv = await fetchMockWarehouseInventory();
    qc.setQueryData(["wms", "warehouse-inventory"], inv);
  }
  const hitInv = inv.find((r) => r.barcode === raw);
  if (hitInv) {
    const nextInv = inv.map((r) =>
      r.id === hitInv.id && r.status === "на складе" ? { ...r, status: "отобран" as const } : r,
    );
    qc.setQueryData(["wms", "warehouse-inventory"], nextInv);
    const legals = qc.getQueryData<LegalEntity[]>(["wms", "legal"]);
    if (legals) {
      qc.setQueryData(["wms", "legal"], mergeLegalWarehouseCounts(legals, nextInv));
    }
    return {
      kind: "inventory_status",
      message: `${hitInv.brand} ${hitInv.productName} · ${hitInv.color} · статус «отобран»`,
      skuLabel: hitInv.barcode,
    };
  }

  return {
    kind: "unknown",
    message: "Код не сопоставлён с приёмкой, коробом или баркодом склада. Проверьте этикетку.",
  };
}
