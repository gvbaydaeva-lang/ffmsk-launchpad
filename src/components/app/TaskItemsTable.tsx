import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/app/StatusBadge";
import {
  planFactLineBadgeClass,
  planFactLineStatusLabel,
  planFactRemaining,
  planFactRowBgClass,
} from "@/lib/planFactDiscrepancy";
import type { TaskWorkflowStatus } from "@/types/domain";

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
};

export default function TaskItemsTable({ rows, variant = "default" }: TaskItemsTableProps) {
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
          const rowBg = outbound ? planFactRowBgClass(row.plan, row.fact) : mismatch ? "bg-red-50/50" : "";
          return (
            <TableRow key={row.id} className={`text-sm ${rowBg}`}>
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
                {outbound ? (
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${planFactLineBadgeClass(row.plan, row.fact)}`}
                  >
                    {planFactLineStatusLabel(row.plan, row.fact)}
                  </span>
                ) : (
                  <StatusBadge status={row.status ?? "pending"} mismatch={mismatch} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
