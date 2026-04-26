import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  planFactRemaining,
  planFactRowBgClass,
} from "@/lib/planFactDiscrepancy";
import { getLineValidation, type LineValidationResult } from "@/utils/wmsValidation";
import type { TaskWorkflowStatus } from "@/types/domain";

function lineValidationBadgeClass(v: LineValidationResult): string {
  switch (v.status) {
    case "ok":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "warning":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "error":
      return "bg-red-100 text-red-800 ring-red-200";
    default:
      return "bg-slate-200 text-slate-800 ring-slate-300";
  }
}

function lineValidationBadgeLabel(v: LineValidationResult): string {
  if (v.status === "ok") return "Ок";
  if (v.status === "warning") return `Не хватает ${v.remainingQty}`;
  return `Ошибка +${v.overQty}`;
}

export type TaskItemRow = {
  id: string;
  name: string;
  article: string;
  barcode: string;
  marketplace: string;
  color: string;
  size: string;
  plan: number;
  fact: number;
  warehouse: string;
  status?: TaskWorkflowStatus;
};

type TaskItemsTableProps = {
  rows: TaskItemRow[];
  /** Реестр отгрузки: колонка «Осталось» и статус план/факт вместо склада и бейджа workflow */
  variant?: "default" | "outboundLines";
  /** Краткая подсветка строки после скана (UI) */
  highlightedRowId?: string | null;
  rowHighlight?: "success" | "error" | null;
};

export default function TaskItemsTable({
  rows,
  variant = "default",
  highlightedRowId = null,
  rowHighlight = null,
}: TaskItemsTableProps) {
  const outbound = variant === "outboundLines";
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-md border border-slate-200">
    <Table className="min-w-[1100px] table-auto">
      <TableHeader>
        <TableRow className="border-slate-200 bg-white">
          <TableHead className="h-9 min-w-[220px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Название</TableHead>
          <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Артикул</TableHead>
          <TableHead className="h-9 min-w-[160px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Баркод</TableHead>
          <TableHead className="h-9 min-w-[90px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">МП</TableHead>
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Цвет</TableHead>
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Размер</TableHead>
          <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">План</TableHead>
          <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">Факт</TableHead>
          {!outbound ? (
            <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
          ) : (
            <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
          )}
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const mismatch = row.plan !== row.fact;
          const remaining = planFactRemaining(row.plan, row.fact);
          const validation = getLineValidation({ plannedQty: row.plan, factQty: row.fact });
          const rowBg = outbound ? planFactRowBgClass(row.plan, row.fact) : mismatch ? "bg-red-50/50" : "";
          const isFlash = highlightedRowId != null && row.id === highlightedRowId && rowHighlight != null;
          const flashClass =
            rowHighlight === "success"
              ? "bg-emerald-100 ring-2 ring-inset ring-emerald-400/90"
              : rowHighlight === "error"
                ? "bg-rose-100 ring-2 ring-inset ring-rose-400/90"
                : "";
          return (
            <TableRow key={row.id} className={cn("text-sm transition-colors duration-150", rowBg, isFlash && flashClass)}>
              <TableCell className="whitespace-nowrap px-3 py-2">{row.name || "—"}</TableCell>
              <TableCell className="whitespace-nowrap px-3 py-2">{row.article || "—"}</TableCell>
              <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.barcode || "—"}</TableCell>
              <TableCell className="px-3 py-2">{row.marketplace || "—"}</TableCell>
              <TableCell className="px-3 py-2">{row.color || "—"}</TableCell>
              <TableCell className="px-3 py-2">{row.size || "—"}</TableCell>
              <TableCell className="px-3 py-2 text-right tabular-nums">{row.plan}</TableCell>
              <TableCell className="px-3 py-2 text-right tabular-nums">{row.fact}</TableCell>
              {!outbound ? (
                <TableCell className="whitespace-nowrap px-3 py-2">{row.warehouse || "—"}</TableCell>
              ) : (
                <TableCell className="px-3 py-2 text-right tabular-nums text-slate-800">{remaining}</TableCell>
              )}
              <TableCell className="px-3 py-2">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${lineValidationBadgeClass(validation)}`}
                >
                  {lineValidationBadgeLabel(validation)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
