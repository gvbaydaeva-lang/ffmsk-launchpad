import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useInventoryMovements, useLocations, useOperationLogs } from "@/hooks/useWmsMock";
import type { InventoryMovement, Location, OperationLog } from "@/types/domain";
import { signedStockDeltaForMovement } from "@/services/mockInventoryMovements";
import { cn } from "@/lib/utils";
import { WmsTableRowActions, type WmsRowActionItem } from "@/components/app/WmsTableRowActions";

type OperationCategory = "receiving" | "placement" | "shipping" | "inventory" | "packing" | "other";

const CATEGORY_FILTER: Array<{ value: "all" | OperationCategory; label: string }> = [
  { value: "all", label: "Все типы" },
  { value: "receiving", label: "Приёмка" },
  { value: "placement", label: "Размещение" },
  { value: "shipping", label: "Отгрузка" },
  { value: "inventory", label: "Инвентаризация" },
  { value: "packing", label: "Упаковка" },
  { value: "other", label: "Прочее" },
];

const CATEGORY_LABEL: Record<OperationCategory, string> = {
  receiving: "Приёмка",
  placement: "Размещение",
  shipping: "Отгрузка",
  inventory: "Инвентаризация",
  packing: "Упаковка",
  other: "Прочее",
};

const SOURCE_LABEL: Record<InventoryMovement["source"], string> = {
  receiving: "Приёмка",
  packing: "Упаковка",
  shipping: "Отгрузка",
  placement: "Размещение",
  inventory_adjustment: "Инвентаризация",
};

const MOVEMENT_TYPE_LABEL: Record<InventoryMovement["type"], string> = {
  INBOUND: "Приход",
  OUTBOUND: "Расход",
  TRANSFER: "Перемещение",
};

function movementCategory(m: InventoryMovement): OperationCategory {
  if (m.source === "inventory_adjustment") return "inventory";
  if (m.source === "placement") return "placement";
  if (m.source === "shipping") return "shipping";
  if (m.source === "receiving") return "receiving";
  if (m.source === "packing") return "packing";
  return "other";
}

function logCategory(log: OperationLog): OperationCategory {
  const t = (log.type || "").toUpperCase();
  if (t === "INVENTORY_ADJUSTMENT") return "inventory";
  if (t.includes("PACK")) return "packing";
  if (t.includes("PLACEMENT") || t === "PLACEMENT_COMPLETED") return "placement";
  if (t.includes("SHIP") || t.includes("SHIPPING") || t === "SHIPPING_PICK" || t === "SHIPPING_PICK_CANCEL")
    return "shipping";
  if (t.includes("RECEIV") || t === "TASK_MISMATCH" || t === "TASK_COMPLETED_WITH_MISMATCH") return "receiving";
  if (t === "INVENTORY_CHANGED") return "other";
  return "other";
}

/** Дублирует строки движений из persist при приёмке — не показываем отдельной строкой. */
function shouldSkipOperationLog(log: OperationLog): boolean {
  return (log.type || "").toUpperCase() === "INVENTORY_CHANGED";
}

function movementDescription(m: InventoryMovement): string {
  const bits: string[] = [MOVEMENT_TYPE_LABEL[m.type], SOURCE_LABEL[m.source]];
  const tn = (m.taskNumber || "").trim();
  if (tn) bits.push(`№ ${tn}`);
  const c = (m.comment || "").trim();
  if (c) bits.push(c);
  return bits.join(" · ");
}

function logDescription(log: OperationLog): string {
  return (log.description || "").trim() || "—";
}

function formatCellForMovement(m: InventoryMovement, locationById: Map<string, Location>): string {
  if (m.type === "TRANSFER") {
    const from = (m.fromLocationId || "").trim();
    const to = (m.locationId || "").trim();
    const fn = from ? (locationById.get(from)?.name ?? from) : "—";
    const tn = to ? (locationById.get(to)?.name ?? to) : "—";
    return `${fn} → ${tn}`;
  }
  const lid = (m.locationId || "").trim();
  if (!lid) return "—";
  return `${lid} / ${locationById.get(lid)?.name ?? "—"}`;
}

type NavLinkKind = "receiving" | "shipping" | "inventory" | null;

type UnifiedRow = {
  id: string;
  createdAt: string;
  category: OperationCategory;
  typeLabel: string;
  description: string;
  productName: string;
  article: string;
  barcode: string;
  qtyDisplay: string;
  cell: string;
  warehouse: string;
  legalEntity: string;
  /** Документ / задание: taskNumber или taskId */
  documentTask: string;
  /** Для кнопки «К отгрузке» — непустой поиск в URL */
  shippingSearch: string;
  navLink: NavLinkKind;
};

function documentTaskLabel(taskNumber: string | undefined, taskId: string | undefined): string {
  const tn = (taskNumber ?? "").trim();
  if (tn) return tn;
  const tid = (taskId ?? "").trim();
  if (tid) return tid;
  return "—";
}

function shippingSearchFromTasks(taskNumber: string | undefined, taskId: string | undefined): string {
  return (taskNumber ?? "").trim() || (taskId ?? "").trim();
}

function navLinkForCategory(cat: OperationCategory, shippingSearch: string): NavLinkKind {
  if (cat === "receiving") return "receiving";
  if (cat === "shipping") return shippingSearch.trim() ? "shipping" : null;
  if (cat === "inventory") return "inventory";
  return null;
}

function movementToRow(m: InventoryMovement, locationById: Map<string, Location>): UnifiedRow {
  const cat = movementCategory(m);
  const doc = documentTaskLabel(m.taskNumber, m.taskId);
  const shipQ = shippingSearchFromTasks(m.taskNumber, m.taskId);
  return {
    id: `m:${m.id}`,
    createdAt: m.createdAt,
    category: cat,
    typeLabel: CATEGORY_LABEL[cat],
    description: movementDescription(m),
    productName: (m.name || "").trim() || "—",
    article: (m.article || m.sku || "").trim() || "—",
    barcode: (m.barcode || "").trim() || "—",
    qtyDisplay:
      m.type === "TRANSFER"
        ? `${m.qty > 0 ? "+" : ""}${Math.trunc(Number(m.qty) || 0)}`
        : (() => {
            const s = signedStockDeltaForMovement(m);
            return `${s > 0 ? "+" : ""}${s}`;
          })(),
    cell: formatCellForMovement(m, locationById),
    warehouse: (m.warehouseName || "").trim() || "—",
    legalEntity: (m.legalEntityName || "").trim() || "—",
    documentTask: doc,
    shippingSearch: shipQ,
    navLink: navLinkForCategory(cat, shipQ),
  };
}

function logToRow(log: OperationLog): UnifiedRow {
  const cat = logCategory(log);
  const doc = documentTaskLabel(log.taskNumber, log.taskId);
  const shipQ = shippingSearchFromTasks(log.taskNumber, log.taskId);
  return {
    id: `l:${log.id}`,
    createdAt: log.createdAt,
    category: cat,
    typeLabel: CATEGORY_LABEL[cat],
    description: logDescription(log),
    productName: "—",
    article: "—",
    barcode: "—",
    qtyDisplay: "—",
    cell: "—",
    warehouse: "—",
    legalEntity: (log.legalEntityName || "").trim() || "—",
    documentTask: doc,
    shippingSearch: shipQ,
    navLink: navLinkForCategory(cat, shipQ),
  };
}

const WarehouseOperationsJournalPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: movementsRaw, isLoading: movLoading, error: movError } = useInventoryMovements();
  const { data: logsRaw, isLoading: logLoading, error: logError } = useOperationLogs();
  const { data: locationsData } = useLocations();

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<"all" | OperationCategory>("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  React.useEffect(() => {
    const raw = searchParams.get("search");
    if (raw != null && raw !== "") setSearch(raw);
  }, [searchParams]);

  const movements = React.useMemo(() => (Array.isArray(movementsRaw) ? movementsRaw : []), [movementsRaw]);
  const logs = React.useMemo(() => (Array.isArray(logsRaw) ? logsRaw : []), [logsRaw]);

  const locationById = React.useMemo(() => {
    const list = Array.isArray(locationsData) ? locationsData : [];
    return new Map(list.map((l) => [l.id, l]));
  }, [locationsData]);

  const unifiedRows = React.useMemo(() => {
    const fromMoves = movements.map((m) => movementToRow(m, locationById));
    const fromLogs = logs.filter((l) => !shouldSkipOperationLog(l)).map(logToRow);
    const merged = [...fromMoves, ...fromLogs];
    merged.sort((a, b) => {
      const ta = Date.parse(a.createdAt) || 0;
      const tb = Date.parse(b.createdAt) || 0;
      return tb - ta;
    });
    return merged;
  }, [movements, logs, locationById]);

  const filteredRows = React.useMemo(() => {
    let rows = unifiedRows;
    if (categoryFilter !== "all") {
      rows = rows.filter((r) => r.category === categoryFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        `${r.productName} ${r.article} ${r.barcode} ${r.description} ${r.documentTask}`.toLowerCase().includes(q),
      );
    }
    const fromTs = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : NaN;
    const toTs = dateTo ? Date.parse(`${dateTo}T23:59:59.999`) : NaN;
    if (Number.isFinite(fromTs)) {
      rows = rows.filter((r) => (Date.parse(r.createdAt) || 0) >= fromTs);
    }
    if (Number.isFinite(toTs)) {
      rows = rows.filter((r) => (Date.parse(r.createdAt) || 0) <= toTs);
    }
    return rows;
  }, [unifiedRows, categoryFilter, search, dateFrom, dateTo]);

  const loading = movLoading || logLoading;
  const error = movError || logError;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Журнал операций</h2>
        <p className="mt-1 text-xs text-slate-600">
          Движения остатков и записи операционного журнала в одной ленте (без пересчёта данных).
        </p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <CardTitle className="text-base">Операции склада</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 max-w-md">
              <Label htmlFor="ops-search" className="text-xs text-slate-600">
                Поиск
              </Label>
              <Input
                id="ops-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Товар, артикул, штрихкод, описание"
                className="mt-1 h-9"
              />
            </div>
            <div className="w-[200px]">
              <Label className="text-xs text-slate-600">Тип операции</Label>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as "all" | OperationCategory)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_FILTER.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ops-from" className="text-xs text-slate-600">
                Дата с
              </Label>
              <Input
                id="ops-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 h-9 w-[150px]"
              />
            </div>
            <div>
              <Label htmlFor="ops-to" className="text-xs text-slate-600">
                Дата по
              </Label>
              <Input
                id="ops-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 h-9 w-[150px]"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <p className="text-xs text-slate-500">Загрузка…</p>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить данные журнала.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата</TableHead>
                    <TableHead className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">
                      Тип операции
                    </TableHead>
                    <TableHead className="min-w-[200px] px-3 py-2 text-xs font-semibold text-slate-600">Описание</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Товар</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Артикул</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Штрихкод</TableHead>
                    <TableHead className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">
                      Количество
                    </TableHead>
                    <TableHead className="min-w-[140px] px-3 py-2 text-xs font-semibold text-slate-600">Ячейка</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                    <TableHead className="min-w-[100px] px-3 py-2 text-xs font-semibold text-slate-600">
                      Документ / задание
                    </TableHead>
                    <TableHead className="w-[120px] px-3 py-2 text-right text-xs font-semibold text-slate-600">
                      Действия
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="py-10 text-center text-xs text-slate-600">
                        Нет операций
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => {
                      const iso = (r.createdAt || "").trim();
                      const dateLabel =
                        iso && Number.isFinite(Date.parse(iso))
                          ? format(parseISO(iso), "dd.MM.yyyy HH:mm", { locale: ru })
                          : "—";
                      return (
                        <TableRow key={r.id} className="h-10 text-xs">
                          <TableCell className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-slate-800">
                            {dateLabel}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 align-middle font-medium text-slate-900">
                            {r.typeLabel}
                          </TableCell>
                          <TableCell className="max-w-[320px] px-3 py-2 align-middle text-xs text-slate-700">{r.description}</TableCell>
                          <TableCell className="max-w-[180px] px-3 py-2 align-middle font-medium text-slate-900">{r.productName}</TableCell>
                          <TableCell className="max-w-[120px] px-3 py-2 align-middle font-mono text-xs text-slate-700">{r.article}</TableCell>
                          <TableCell className="max-w-[120px] px-3 py-2 align-middle font-mono text-xs text-slate-700">{r.barcode}</TableCell>
                          <TableCell
                            className={cn(
                              "px-3 py-2 text-right align-middle tabular-nums font-medium",
                              r.qtyDisplay.startsWith("-") ? "text-red-700" : r.qtyDisplay.startsWith("+") ? "text-emerald-800" : "text-slate-700",
                            )}
                          >
                            {r.qtyDisplay}
                          </TableCell>
                          <TableCell className="max-w-[200px] px-3 py-2 align-middle text-xs text-slate-700">{r.cell}</TableCell>
                          <TableCell className="max-w-[120px] truncate px-3 py-2 align-middle text-slate-700">{r.warehouse}</TableCell>
                          <TableCell className="max-w-[140px] truncate px-3 py-2 align-middle text-slate-700">{r.legalEntity}</TableCell>
                          <TableCell className="max-w-[160px] truncate px-3 py-2 align-middle font-mono text-[11px] text-slate-700">
                            {r.documentTask}
                          </TableCell>
                          <TableCell className="px-2 py-2 text-right align-middle">
                            {(() => {
                              const items: WmsRowActionItem[] = [];
                              if (r.navLink === "receiving") {
                                items.push({
                                  id: "nav-rec",
                                  label: "Перейти",
                                  onSelect: () => navigate("/receiving"),
                                });
                              }
                              if (r.navLink === "shipping" && r.shippingSearch) {
                                items.push({
                                  id: "nav-ship",
                                  label: "Найти",
                                  onSelect: () =>
                                    navigate(`/shipping?search=${encodeURIComponent(r.shippingSearch ?? "")}`),
                                });
                              }
                              if (r.navLink === "inventory") {
                                items.push({
                                  id: "nav-inv",
                                  label: "Перейти",
                                  onSelect: () => navigate("/inventory"),
                                });
                              }
                              return <WmsTableRowActions items={items} />;
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehouseOperationsJournalPage;
