import type { InboundSupply, InventoryMovement } from "@/types/domain";

/**
 * INBOUND-движения по факту приёмки (только строки с factQty > 0).
 * source = receiving — для дедупликации по taskId при завершении задания.
 */
export function buildInboundReceivingInventoryMovements(
  supply: InboundSupply,
  legalEntityName: string,
  locationId?: string,
): InventoryMovement[] {
  const ts = new Date().toISOString();
  const stamp = Date.now();
  const leId = (supply.legalEntityId || "").trim();
  const mp = (supply.marketplace || "wb").toString().toUpperCase();
  const warehouseName = (supply.destinationWarehouse || "").trim() || "—";

  const moves: InventoryMovement[] = [];
  for (let i = 0; i < supply.items.length; i++) {
    const it = supply.items[i];
    const q = Number(it.factualQuantity) || 0;
    if (q <= 0) continue;
    moves.push({
      id: `im-in-${supply.id}-${i}-${stamp}`,
      type: "INBOUND",
      source: "receiving",
      taskId: supply.id,
      taskNumber: supply.documentNo,
      legalEntityId: leId,
      legalEntityName: (legalEntityName || "").trim() || leId,
      warehouseName,
      locationId: (locationId || "").trim() || undefined,
      itemId: it.productId ?? `line-${i}`,
      name: (it.name || it.barcode || "—").trim() || "—",
      sku: (it.supplierArticle || "").trim() || undefined,
      article: (it.supplierArticle || "").trim() || "—",
      barcode: (it.barcode || "").trim() || "—",
      marketplace: mp,
      color: (it.color || "").trim() || "—",
      size: (it.size || "").trim() || "—",
      qty: q,
      createdAt: ts,
    });
  }
  return moves;
}
