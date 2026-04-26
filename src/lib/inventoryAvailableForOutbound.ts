import { makeInventoryBalanceKey } from "@/lib/inventoryBalanceKey";
import { reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";
import type { InventoryMovement, OutboundShipment, ProductCatalogItem } from "@/types/domain";

/**
 * Доступно для новой строки отгрузки по каталогу: остаток WMS по движениям минус резерв (pending/processing).
 * Для orphan / неизвестного productId — null (проверку не делаем).
 */
export function wmsAvailableForCatalogProduct(params: {
  movements: InventoryMovement[];
  outbound: OutboundShipment[];
  catalog: ProductCatalogItem[];
  legalEntityId: string;
  warehouseName: string;
  productId: string;
}): number | null {
  if (params.productId.startsWith("orphan:")) return null;
  const product = params.catalog.find((p) => p.id === params.productId);
  if (!product) return null;
  const wh = (params.warehouseName || "").trim() || "—";
  const key = makeInventoryBalanceKey({
    legalEntityId: params.legalEntityId,
    warehouseName: wh,
    barcode: (product.barcode || "").trim() || "—",
    article: (product.supplierArticle || "").trim() || "—",
    color: (product.color || "").trim() || "—",
    size: (product.size || "").trim() || "—",
  });
  const balance = getBalanceByKeyMap(params.movements).get(key) ?? 0;
  const reserve = reservedQtyByBalanceKey(params.outbound, params.catalog).get(key) ?? 0;
  return balance - reserve;
}
