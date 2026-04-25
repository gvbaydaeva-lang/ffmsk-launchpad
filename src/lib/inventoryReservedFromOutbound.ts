import { makeInventoryBalanceKey } from "@/lib/inventoryBalanceKey";
import type { OutboundShipment, ProductCatalogItem } from "@/types/domain";

/** Ключ остатка для строки отгрузки/упаковки — те же поля, что в движениях и `makeInventoryBalanceKeyFromMovement`. */
export function balanceKeyFromOutboundShipment(
  sh: OutboundShipment,
  product: ProductCatalogItem | null | undefined,
): string {
  const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
  const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
  const color = (sh.importColor || product?.color || "").trim() || "—";
  const size = (sh.importSize || product?.size || "").trim() || "—";
  const warehouseName = (sh.sourceWarehouse || "").trim() || "—";
  return makeInventoryBalanceKey({
    legalEntityId: sh.legalEntityId,
    warehouseName,
    barcode,
    article,
    color,
    size,
  });
}

/** Строка участвует в резерве «В работе», пока задание не завершено (нет OUTBOUND по завершению). */
function isOutboundLineActiveReserve(sh: OutboundShipment): boolean {
  if (sh.status === "отгружено") return false;
  const wf = sh.workflowStatus ?? "pending";
  if (wf === "completed") return false;
  return wf === "pending" || wf === "processing";
}

/**
 * Сумма plannedUnits по активным (pending/processing) строкам outbound, по ключу остатка.
 */
export function reservedQtyByBalanceKey(
  outbound: OutboundShipment[] | undefined,
  catalog: ProductCatalogItem[] | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!outbound?.length) return map;
  const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
  for (const sh of outbound) {
    if (!isOutboundLineActiveReserve(sh)) continue;
    const product = byProduct.get(sh.productId);
    const key = balanceKeyFromOutboundShipment(sh, product ?? null);
    const plan = Number(sh.plannedUnits) || 0;
    if (plan <= 0) continue;
    map.set(key, (map.get(key) ?? 0) + plan);
  }
  return map;
}
