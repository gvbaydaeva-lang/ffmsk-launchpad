import type { OutboundShipment } from "@/types/domain";

/** Подобрано: pickedUnits или shippedUnits (legacy), без учёта упаковки. */
export function outboundPickedQty(sh: OutboundShipment): number {
  const n = Number(sh.pickedUnits);
  if (sh.pickedUnits != null && Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  return Math.max(0, Math.trunc(Number(sh.shippedUnits ?? 0) || 0));
}

/** Явное «упаковано» из поля packedQty; null — в данных нет отдельного счётчика. */
export function outboundPackedQtyExplicit(sh: OutboundShipment): number | null {
  if (sh.packedQty == null || !Number.isFinite(Number(sh.packedQty))) return null;
  return Math.max(0, Math.trunc(Number(sh.packedQty)));
}

/**
 * Отображение «упаковано»: packedQty ?? подобрано ?? 0 (fallback для старых данных).
 */
export function outboundPackedQtyDisplay(sh: OutboundShipment): number {
  const ex = outboundPackedQtyExplicit(sh);
  if (ex != null) return ex;
  return Math.max(0, outboundPickedQty(sh));
}

/**
 * Счётчик для скана и «осталось упаковать»: явный packedQty, иначе legacy packedUnits (не выше подобранного).
 */
export function outboundPackedQtyStoredOrZero(sh: OutboundShipment): number {
  const ex = outboundPackedQtyExplicit(sh);
  if (ex != null) return ex;
  const picked = outboundPickedQty(sh);
  const legacy = Math.max(0, Math.trunc(Number(sh.packedUnits ?? 0) || 0));
  return Math.min(picked, legacy);
}

export function outboundPackCapForShipment(sh: OutboundShipment): number {
  return outboundPickedQty(sh);
}

export function outboundPackRemainingForShipment(sh: OutboundShipment): number {
  const cap = outboundPackCapForShipment(sh);
  return Math.max(0, cap - outboundPackedQtyStoredOrZero(sh));
}
