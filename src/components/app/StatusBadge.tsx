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
          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
          "bg-violet-100 text-violet-800 ring-violet-200",
        )}
      >
        В работе
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
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
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
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
  const needReview = requiresReview || mismatch;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <PrimaryBadge status={status} />
      {needReview ? (
        <span
          className={cn(
            "inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950",
          )}
        >
          Требует проверки
        </span>
      ) : null}
    </span>
  );
}
