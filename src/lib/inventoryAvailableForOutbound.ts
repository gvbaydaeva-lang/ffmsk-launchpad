import { makeInventoryBalanceKey } from "@/lib/inventoryBalanceKey";
import { reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";
import type { InventoryMovement, OutboundShipment, ProductCatalogItem } from "@/types/domain";

export type WmsStockBreakdown = {
  balanceQty: number;
  reserveQty: number;
  availableQty: number;
};

/**
 * Остаток по движениям WMS, резерв (pending/processing outbound), доступно = остаток − резерв.
 * Для orphan / неизвестного productId — null (проверку не делаем).
 */
export function wmsStockBreakdownForCatalogProduct(params: {
  movements: InventoryMovement[];
  outbound: OutboundShipment[];
  catalog: ProductCatalogItem[];
  legalEntityId: string;
  warehouseName: string;
  productId: string;
}): WmsStockBreakdown | null {
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
  const balanceByKey = getBalanceByKeyMap(params.movements);
  const reserveByKey = reservedQtyByBalanceKey(params.outbound, params.catalog);
  const balanceQty = balanceByKey.get(key) ?? 0;
  const reserveQty = reserveByKey.get(key) ?? 0;
  return {
    balanceQty,
    reserveQty,
    availableQty: balanceQty - reserveQty,
  };
}

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
  const b = wmsStockBreakdownForCatalogProduct(params);
  return b ? b.availableQty : null;
}
