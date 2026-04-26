/** Внутренний приоритет задания на отгрузку / в очереди Упаковщика */
export type OutboundTaskPriority = "high" | "normal" | "low";

export function normalizeOutboundPriority(sh: {
  priority?: OutboundTaskPriority | null;
  packingPriority?: OutboundTaskPriority | null;
}): OutboundTaskPriority {
  const p = sh.priority ?? sh.packingPriority;
  if (p === "high" || p === "low") return p;
  return "normal";
}

export function mergePriorityFromShipments(
  shipments: Array<{ priority?: OutboundTaskPriority | null; packingPriority?: OutboundTaskPriority | null }>,
): OutboundTaskPriority {
  let rank = 0;
  for (const sh of shipments) {
    const p = normalizeOutboundPriority(sh);
    const r = p === "high" ? 2 : p === "normal" ? 1 : 0;
    rank = Math.max(rank, r);
  }
  if (rank === 2) return "high";
  if (rank === 1) return "normal";
  return "low";
}

export function outboundPrioritySortKey(p: OutboundTaskPriority): number {
  return p === "high" ? 0 : p === "normal" ? 1 : 2;
}

export function outboundPriorityBadgeClass(p: OutboundTaskPriority): string {
  if (p === "high") return "bg-red-100 text-red-800 ring-1 ring-red-200";
  if (p === "low") return "bg-slate-50 text-slate-500 ring-1 ring-slate-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

export function outboundPriorityLabel(p: OutboundTaskPriority): string {
  if (p === "high") return "Высокий";
  if (p === "low") return "Низкий";
  return "Обычный";
}
