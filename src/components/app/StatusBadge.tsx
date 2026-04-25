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
  void requiresReview;
  void mismatch;

  return (
    <span className={cn("inline-flex", className)}>
      <PrimaryBadge status={status} />
    </span>
  );
}
