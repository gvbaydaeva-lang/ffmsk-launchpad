import type { TaskWorkflowStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status?: TaskWorkflowStatus;
  /** План ≠ факт: оранжевый бейдж «Требует проверки» рядом с основным статусом (completed не заменяем) */
  requiresReview?: boolean;
  /** @deprecated используйте requiresReview */
  mismatch?: boolean;
  className?: string;
};

function PrimaryBadge({ status }: { status: TaskWorkflowStatus }) {
  if (status === "processing") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-violet-100 text-violet-800 ring-violet-200",
        )}
      >
        В работе
      </span>
    );
  }
  if (status === "assembling") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-sky-100 text-sky-900 ring-sky-200",
        )}
      >
        В сборке
      </span>
    );
  }
  if (status === "assembled") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-emerald-50 text-emerald-800 ring-emerald-200/90",
        )}
      >
        Собрано
      </span>
    );
  }
  if (status === "shipped") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-emerald-800 text-emerald-50 ring-emerald-900/30",
        )}
      >
        Отгружено
      </span>
    );
  }
  if (status === "shipped_with_diff") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-amber-100 text-amber-900 ring-amber-200",
        )}
      >
        Отгружено с расхождением
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span
        className={cn(
          "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
          "bg-emerald-100 text-emerald-800 ring-emerald-200",
        )}
      >
        Завершено
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        "bg-blue-100 text-blue-800 ring-blue-200",
      )}
    >
      Новое
    </span>
  );
}

export default function StatusBadge({
  status = "pending",
  requiresReview = false,
  mismatch = false,
  className,
}: StatusBadgeProps) {
  void requiresReview;
  void mismatch;

  return (
    <span className={cn("inline-flex", className)}>
      <PrimaryBadge status={status} />
    </span>
  );
}
