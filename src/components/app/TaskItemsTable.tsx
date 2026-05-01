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

/** Колонка «Статус» состава отгрузки: этапы подбора / упаковки (не workflow задания). */
function outboundLineProcessBadge(row: TaskItemRow): { className: string; label: string } {
  const plan = Math.max(0, Math.trunc(Number(row.plan ?? 0) || 0));
  const fact = Math.max(0, Math.trunc(Number(row.fact ?? 0) || 0));
  const packedQty = Math.max(0, Math.trunc(Number(row.shippingPackedQty ?? 0) || 0));

  if (row.shippingStock?.state === "short") {
    const shortage = Math.max(0, Math.trunc(Number(row.shippingStock.shortage) || 0));
    return {
      className: "bg-amber-100 text-amber-900 ring-amber-200",
      label: shortage > 0 ? `Не хватает ${shortage}` : "Не хватает",
    };
  }

  const validation = getLineValidation({ plannedQty: plan, factQty: fact });
  if (validation.status === "error") {
    return { className: lineValidationBadgeClass(validation), label: lineValidationBadgeLabel(validation) };
  }

  if (plan <= 0) {
    return { className: "bg-slate-100 text-slate-600 ring-slate-200", label: "—" };
  }

  if (fact === 0) {
    return { className: "bg-slate-100 text-slate-700 ring-slate-200", label: "Ожидает подбора" };
  }
  if (fact < plan) {
    return { className: "bg-amber-100 text-amber-900 ring-amber-200", label: "Подобрано частично" };
  }

  // fact полностью по плану
  if (packedQty === 0) {
    return { className: "bg-slate-100 text-slate-700 ring-slate-200", label: "Ожидает упаковки" };
  }
  if (packedQty < plan) {
    return { className: "bg-amber-100 text-amber-900 ring-amber-200", label: "Упаковано частично" };
  }
  return { className: "bg-emerald-100 text-emerald-800 ring-emerald-200", label: "Упаковано полностью" };
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
  /** outboundLines: упаковано (packedQty ?? 0). */
  shippingPackedQty?: number;
  warehouse: string;
  status?: TaskWorkflowStatus;
  /** Только экран «Отгрузки»: доступно по WMS (остаток − резерв) vs план строки */
  shippingStock?: { state: "sufficient" } | { state: "short"; available: number; shortage: number };
  /** Только экран «Отгрузки»: доступный остаток по местам (storage влияет на логику, other — только информативно). */
  shippingLocations?: {
    storage: Array<{ locationId: string; label: string; available: number }>;
    other: Array<{ label: string; available: number }>;
  };
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
  const showShippingStock = outbound && rows.some((r) => r.shippingStock !== undefined);
  const showShippingLocations = outbound && rows.some((r) => r.shippingLocations !== undefined);
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-md border border-slate-200">
    <Table
      className={cn(
        "table-auto",
        showShippingStock && showShippingLocations
          ? "min-w-[1600px]"
          : showShippingStock || showShippingLocations
            ? "min-w-[1400px]"
            : outbound
              ? "min-w-[1260px]"
              : "min-w-[1100px]",
      )}
    >
      <TableHeader>
        <TableRow className="border-slate-200 bg-white">
          <TableHead className="h-9 min-w-[220px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Название</TableHead>
          <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Артикул</TableHead>
          <TableHead className="h-9 min-w-[160px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Баркод</TableHead>
          <TableHead className="h-9 min-w-[90px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">МП</TableHead>
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Цвет</TableHead>
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Размер</TableHead>
          <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">План</TableHead>
          <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">
            {outbound ? "Подобрано" : "Факт"}
          </TableHead>
          {outbound ? (
            <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">Упаковано</TableHead>
          ) : null}
          {!outbound ? (
            <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
          ) : (
            <TableHead className="h-9 px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
          )}
          {showShippingStock ? (
            <TableHead className="h-9 min-w-[200px] px-3 py-2 text-xs font-semibold text-slate-600">Доступно</TableHead>
          ) : null}
          {showShippingLocations ? (
            <TableHead className="h-9 min-w-[220px] px-3 py-2 text-xs font-semibold text-slate-600">По местам</TableHead>
          ) : null}
          <TableHead className="h-9 px-3 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const planN = Number(row.plan ?? 0);
          const factN = Number(row.fact ?? 0);
          const mismatch = planN !== factN;
          const remaining = planFactRemaining(planN, factN);
          const packedCell = outbound ? Number(row.shippingPackedQty ?? 0) : factN;
          const validation = getLineValidation({ plannedQty: planN, factQty: factN });
          const outboundBadge = outbound ? outboundLineProcessBadge(row) : null;
          const rowBg = outbound ? planFactRowBgClass(planN, factN) : mismatch ? "bg-red-50/50" : "";
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
              <TableCell className="px-3 py-2 text-right tabular-nums">{planN}</TableCell>
              <TableCell className="px-3 py-2 text-right tabular-nums">{factN}</TableCell>
              {outbound ? (
                <TableCell className="px-3 py-2 text-right tabular-nums">
                  <div>{packedCell}</div>
                </TableCell>
              ) : null}
              {!outbound ? (
                <TableCell className="whitespace-nowrap px-3 py-2">{row.warehouse || "—"}</TableCell>
              ) : (
                <TableCell className="px-3 py-2 text-right tabular-nums text-slate-800">{remaining}</TableCell>
              )}
              {showShippingStock ? (
                <TableCell className="px-3 py-2 align-top text-xs text-slate-800">
                  {row.shippingStock?.state === "short" ? (
                    <div className="space-y-1">
                      <div className="tabular-nums">Доступно: {row.shippingStock.available.toLocaleString("ru-RU")}</div>
                      <div className="font-medium text-red-600 tabular-nums">
                        Не хватает {row.shippingStock.shortage.toLocaleString("ru-RU")} шт
                      </div>
                    </div>
                  ) : row.shippingStock?.state === "sufficient" ? (
                    <span className="text-emerald-800">Доступно достаточно</span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              ) : null}
              {showShippingLocations ? (
                <TableCell className="px-3 py-2 align-top text-xs text-slate-800">
                  {row.shippingLocations === undefined ? (
                    "—"
                  ) : (
                    <div className="space-y-1.5">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ячейки хранения</div>
                        {row.shippingLocations.storage.length > 0 ? (
                          <ul className="mt-0.5 list-none space-y-0.5">
                            {row.shippingLocations.storage.map((line, idx) => (
                              <li key={`storage-${line.label}-${idx}`} className="tabular-nums">
                                {line.label} — {line.available.toLocaleString("ru-RU")} шт
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-500">Нет доступных остатков в ячейках хранения</span>
                        )}
                      </div>
                      {row.shippingLocations.other.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Прочее</div>
                          <ul className="mt-0.5 list-none space-y-0.5">
                            {row.shippingLocations.other.map((line, idx) => (
                              <li key={`other-${line.label}-${idx}`} className="tabular-nums">
                                {line.label} — {line.available.toLocaleString("ru-RU")} шт
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}
                </TableCell>
              ) : null}
              <TableCell className="px-3 py-2">
                {outboundBadge ? (
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${outboundBadge.className}`}
                  >
                    {outboundBadge.label}
                  </span>
                ) : (
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${lineValidationBadgeClass(validation)}`}
                  >
                    {lineValidationBadgeLabel(validation)}
                  </span>
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
