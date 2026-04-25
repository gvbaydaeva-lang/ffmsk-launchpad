import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { TaskWorkflowStatus } from "@/types/domain";
import StatusBadge from "@/components/app/StatusBadge";

export type TaskRegistryRow = {
  id: string;
  createdAtLabel: string;
  taskNo: string;
  legalEntityLabel?: string;
  status: TaskWorkflowStatus;
  warehouseLabel?: string;
  marketplaceLabel?: string;
  plan: number;
  fact: number;
  isNew?: boolean;
  /** План ≠ факт после завершения (алиас для requiresReview при completed) */
  mismatch?: boolean;
  /** План ≠ факт: показать «Требует проверки» */
  requiresReview?: boolean;
  /** Суммарный перерасход max(0, факт − план) */
  overrun?: number;
};

type Props = {
  rows: TaskRegistryRow[];
  onOpen?: (id: string) => void;
  onAction?: (id: string) => void;
  selectedId?: string | null;
  showLegalEntity?: boolean;
  emptyText?: string;
};

export default function TaskRegistryTable({
  rows,
  onOpen,
  onAction,
  selectedId,
  showLegalEntity = true,
  emptyText = "Нет заданий для отображения.",
}: Props) {
  const actionLabel = (status: TaskWorkflowStatus) => {
    if (status === "processing") return "Продолжить";
    if (status === "completed") return "Завершено";
    return "В работу";
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата создания</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">№ задания</TableHead>
          {showLegalEntity ? (
            <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
          ) : null}
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Маркетплейс</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">План</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Факт</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
          <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Перерасход</TableHead>
          <TableHead className="h-9 w-[110px] whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showLegalEntity ? 11 : 10} className="px-3 py-6 text-center text-sm text-slate-500">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const isSelected = selectedId === row.id;
            return (
              <TableRow
                key={row.id}
                className={`cursor-pointer border-slate-100 text-sm ${isSelected ? "bg-slate-50" : ""} ${row.isNew ? "bg-blue-50/60" : ""}`}
                onClick={() => onOpen?.(row.id)}
              >
                <TableCell className="whitespace-nowrap px-3 py-2 tabular-nums">{row.createdAtLabel || "—"}</TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 font-medium">{row.taskNo || "—"}</TableCell>
                {showLegalEntity ? <TableCell className="max-w-[210px] truncate px-3 py-2">{row.legalEntityLabel || "—"}</TableCell> : null}
                <TableCell className="px-3 py-2">
                  <StatusBadge status={row.status} mismatch={row.mismatch} requiresReview={row.requiresReview} />
                </TableCell>
                <TableCell className="max-w-[190px] truncate px-3 py-2">{row.warehouseLabel || "—"}</TableCell>
                <TableCell className="px-3 py-2">{row.marketplaceLabel || "—"}</TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{row.plan}</TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{row.fact}</TableCell>
                <TableCell
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    row.plan > row.fact ? "font-medium text-amber-800" : row.plan < row.fact ? "font-medium text-red-700" : ""
                  }`}
                >
                  {Math.max(0, row.plan - row.fact)}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    (row.overrun ?? Math.max(0, row.fact - row.plan)) > 0 ? "font-medium text-red-700" : ""
                  }`}
                >
                  {row.overrun ?? Math.max(0, row.fact - row.plan)}
                </TableCell>
                <TableCell className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-slate-200 text-xs"
                    disabled={row.status === "completed"}
                    onClick={() => onAction?.(row.id)}
                  >
                    {actionLabel(row.status)}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
