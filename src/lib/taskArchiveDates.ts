import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import type { InboundSupply, OutboundShipment } from "@/types/domain";
import { workflowFromInbound } from "@/lib/taskWorkflowUi";

export function formatTaskArchiveDateLabel(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy HH:mm", { locale: ru });
  } catch {
    return "—";
  }
}

/** ISO даты создания задания приёмки (для реестра). */
export function inboundSupplyCreatedAtIso(s: InboundSupply): string | undefined {
  const raw = (s.createdAt ?? s.eta ?? "").trim();
  return raw || undefined;
}

/** ISO завершения приёмки; для завершённых — completedAt → updatedAt → createdAt → eta. */
export function inboundSupplyCompletedAtIso(s: InboundSupply): string | undefined {
  if (workflowFromInbound(s) !== "completed") return undefined;
  const raw = (s.completedAt ?? s.updatedAt ?? s.createdAt ?? s.eta ?? "").trim();
  return raw || undefined;
}

/** Сортировка: новее — больше timestamp. */
export function inboundArchiveSortKey(s: InboundSupply): number {
  return Date.parse(inboundSupplyCompletedAtIso(s) ?? inboundSupplyCreatedAtIso(s) ?? s.eta ?? "") || 0;
}

/** Группа outbound завершена, если все строки завершены/отгружены. */
export function outboundGroupIsArchived(shipments: OutboundShipment[]): boolean {
  return shipments.every((sh) => sh.workflowStatus === "completed" || sh.status === "отгружено");
}

/** Максимальный момент завершения по строкам (completedAt → updatedAt → createdAt). */
export function outboundShipmentsCompletedAtIso(shipments: OutboundShipment[]): string | undefined {
  if (!outboundGroupIsArchived(shipments)) return undefined;
  let max = "";
  for (const sh of shipments) {
    const raw = (sh.completedAt ?? sh.updatedAt ?? sh.createdAt ?? "").trim();
    if (raw && raw > max) max = raw;
  }
  return max || undefined;
}

export function outboundArchiveSortKey(shipments: OutboundShipment[]): number {
  return Date.parse(outboundShipmentsCompletedAtIso(shipments) ?? shipments[0]?.createdAt ?? "") || 0;
}
