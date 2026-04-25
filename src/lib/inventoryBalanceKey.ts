import type { InventoryMovement } from "@/types/domain";

export type BalanceKeyParts = {
  legalEntityId: string;
  warehouseName: string;
  barcode: string;
  article: string;
  color: string;
  size: string;
};

const norm = (s: string | undefined | null) => (s ?? "").trim();

/**
 * Ключ остатка: legalEntity, склад, баркод, артикул, цвет, размер
 * (см. требования WMS-группировки)
 */
export function makeInventoryBalanceKey(p: BalanceKeyParts): string {
  return [
    norm(p.legalEntityId),
    norm(p.warehouseName) || "—",
    norm(p.barcode) || "—",
    norm(p.article) || "—",
    norm(p.color) || "—",
    norm(p.size) || "—",
  ].join("::");
}

export function makeInventoryBalanceKeyFromMovement(m: InventoryMovement): string {
  return makeInventoryBalanceKey({
    legalEntityId: m.legalEntityId,
    warehouseName: m.warehouseName ?? "",
    barcode: m.barcode,
    article: m.article ?? m.sku ?? "",
    color: m.color,
    size: m.size,
  });
}
