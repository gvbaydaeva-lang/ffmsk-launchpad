import { cn } from "@/lib/utils";
import type { InboundSupply, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";

export function normalizeWorkflowStatus(status: TaskWorkflowStatus | undefined | null): TaskWorkflowStatus {
  return status ?? "pending";
}

/** Обводка и фон карточки задания */
export function taskWorkflowCardClass(status: TaskWorkflowStatus): string {
  switch (status) {
    case "processing":
      return cn(
        "border-violet-200 bg-violet-50/70 shadow-sm ring-1 ring-violet-200/60",
      );
    case "completed":
      return cn("border-slate-200/80 bg-slate-100/70 shadow-none opacity-90 saturate-[0.85]");
    default:
      return "border-slate-200 bg-white shadow-sm";
  }
}

/** Основная кнопка действия на карточке (без variant default — явные цвета) */
export function taskWorkflowActionButtonClass(status: TaskWorkflowStatus): string {
  const base = cn(
    "h-11 w-full rounded-lg text-base font-semibold shadow-none transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  );
  switch (status) {
    case "pending":
      return cn(
        base,
        "bg-blue-600 text-white hover:bg-blue-700",
        "focus-visible:ring-blue-500",
      );
    case "processing":
      return cn(
        base,
        "bg-violet-600 text-white hover:bg-violet-700",
        "focus-visible:ring-violet-500",
      );
    case "completed":
      return cn(
        base,
        "cursor-not-allowed bg-emerald-600 text-white hover:bg-emerald-600",
        "disabled:cursor-not-allowed disabled:opacity-80",
        "focus-visible:ring-emerald-500",
      );
    default:
      return base;
  }
}

export function taskWorkflowActionLabel(status: TaskWorkflowStatus): string {
  switch (status) {
    case "pending":
      return "Взять в работу";
    case "processing":
      return "Продолжить";
    case "completed":
      return "Завершено";
    default:
      return "Взять в работу";
  }
}

/** Порядок сортировки: новые сверху, завершённые в конец */
export function compareWorkflowPriority(a: TaskWorkflowStatus, b: TaskWorkflowStatus): number {
  const order = (s: TaskWorkflowStatus) => (s === "pending" ? 0 : s === "processing" ? 1 : 2);
  return order(a) - order(b);
}

/** Статус карточки приёмки с учётом legacy-поля status */
export function workflowFromInbound(row: InboundSupply): TaskWorkflowStatus {
  if (row.workflowStatus) return row.workflowStatus;
  if (row.status === "принято") return "completed";
  if (row.status === "на приёмке") return "processing";
  return "pending";
}

/** Статус задания отгрузки по группе строк */
export function workflowFromOutboundGroup(shipments: OutboundShipment[]): TaskWorkflowStatus {
  const perRow = shipments.map((s) => {
    if (s.workflowStatus === "completed" || s.status === "отгружено") return "completed" as const;
    if (s.workflowStatus === "processing") return "processing" as const;
    return (s.workflowStatus ?? "pending") as TaskWorkflowStatus;
  });
  if (perRow.every((x) => x === "completed")) return "completed";
  if (perRow.some((x) => x === "processing")) return "processing";
  return "pending";
}
