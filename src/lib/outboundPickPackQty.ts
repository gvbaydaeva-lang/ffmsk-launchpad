import type { OutboundShipment } from "@/types/domain";

/** Подобрано: pickedUnits или shippedUnits (legacy), без учёта упаковки. */
export function outboundPickedQty(sh: OutboundShipment): number {
  const n = Number(sh.pickedUnits);
  if (sh.pickedUnits != null && Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  return Math.max(0, Math.trunc(Number(sh.shippedUnits ?? 0) || 0));
}

/**
 * Упаковано по полю packedQty: отсутствие или null → 0 (без подстановки подбора и без packedUnits).
 */
export function outboundPackedQtyAssemblyGate(sh: OutboundShipment): number {
  const raw = Number(sh.packedQty ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

/** Для UI «Упаковано» и для лимитов скана — только packedQty ?? 0. */
export function outboundPackedQtyDisplay(sh: OutboundShipment): number {
  return outboundPackedQtyAssemblyGate(sh);
}

/** Счётчик упакованного для скана (то же правило, что и display). */
export function outboundPackedQtyStoredOrZero(sh: OutboundShipment): number {
  return outboundPackedQtyAssemblyGate(sh);
}

/** Сколько ещё можно отсканировать: подобрано − уже упаковано (packedQty ?? 0). */
export function outboundPackCapForShipment(sh: OutboundShipment): number {
  return outboundPickedQty(sh);
}

export function outboundPackRemainingForShipment(sh: OutboundShipment): number {
  return Math.max(0, outboundPickedQty(sh) - outboundPackedQtyAssemblyGate(sh));
}

/** Все строки с plan > 0: packedQty (?? 0) >= plan. Непустая группа строк. */
export function outboundShipmentsPackedQtyPlanSatisfied(rows: OutboundShipment[] | null | undefined): boolean {
  const safe = rows ?? [];
  if (!Array.isArray(safe) || safe.length === 0) return false;
  return safe.every((sh) => {
    const plan = Number(sh.plannedUnits ?? 0) || 0;
    if (plan <= 0) return true;
    return outboundPackedQtyAssemblyGate(sh) >= plan;
  });
}
