import type { TaskWorkflowStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status?: TaskWorkflowStatus;
  mismatch?: boolean;
  className?: string;
};

export default function StatusBadge({ status = "pending", mismatch = false, className }: StatusBadgeProps) {
  if (mismatch) {
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
          "bg-red-100 text-red-700 ring-red-200",
          className,
        )}
      >
        Требует проверки
      </span>
    );
  }

  if (status === "processing") {
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
          "bg-violet-100 text-violet-800 ring-violet-200",
          className,
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
          className,
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
        className,
      )}
    >
      Новое
    </span>
  );
}
