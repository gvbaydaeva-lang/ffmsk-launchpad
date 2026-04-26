import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  Package,
  Truck,
  Wallet,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useDashboardBundleQuery } from "@/hooks/useDashboardAnalytics";
import { useInboundSupplies, useInventoryMovements, useOperationLogs, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { mergePriorityFromShipments } from "@/lib/outboundTaskPriority";
import { workflowFromInbound, workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";
import { balanceKeyFromOutboundShipment, reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";
import { sumStorageDay } from "@/services/mockDashboardBundle";

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function isTodayIso(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboardBundleQuery();
  const { data: inboundRaw } = useInboundSupplies();
  const { data: outboundRaw } = useOutboundShipments();
  const { data: catalogRaw } = useProductCatalog();
  const { data: movementsRaw, balanceRows: balanceRowsRaw } = useInventoryMovements();
  const { data: operationLogsRaw } = useOperationLogs();

  const storageTotal = data ? sumStorageDay(data.storageByClient) : 0;
  const receiving = safeArray(inboundRaw);
  const shipping = safeArray(outboundRaw);
  const catalog = safeArray(catalogRaw);
  const movements = safeArray(movementsRaw);
  const inventory = safeArray(balanceRowsRaw);
  const operationLogs = safeArray(operationLogsRaw);

  const receivingTotal = receiving.length;
  const receivingProcessing = receiving.filter((row) => workflowFromInbound(row) === "processing").length;
  const receivingCompleted = receiving.filter((row) => workflowFromInbound(row) === "completed").length;

  const assignmentGroups = new Map<string, typeof shipping>();
  for (const row of shipping) {
    const key = `${row.legalEntityId}::${row.assignmentId ?? row.assignmentNo ?? row.id}`;
    const prev = assignmentGroups.get(key) ?? [];
    prev.push(row);
    assignmentGroups.set(key, prev);
  }
  const assignments = Array.from(assignmentGroups.values());

  const startWithTopTasks: Array<{
    groupKey: string;
    label: string;
    line: "shortage" | "high" | "processing";
    shortageUnits?: number;
  }> = (() => {
    const out: Array<{
      groupKey: string;
      label: string;
      line: "shortage" | "high" | "processing";
      shortageUnits?: number;
    }> = [];
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return out;
    }
    const byProduct = new Map(catalog.map((p) => [p.id, p]));
    const balanceByKey = getBalanceByKeyMap(movements);
    const resByKey = reservedQtyByBalanceKey(shipping, catalog);
    const hasMovements = movements.length > 0;
    const used = new Set<string>();

    const groupKey = (rows: (typeof shipping)[number][]) => {
      if (!Array.isArray(rows) || !rows[0]) return "";
      const r = rows[0];
      return `${r.legalEntityId}::${r.assignmentId ?? r.assignmentNo ?? r.id}`;
    };
    const label = (rows: (typeof shipping)[number][]) => {
      if (!Array.isArray(rows) || !rows[0]) return "";
      const r = rows[0];
      return String(r.assignmentNo?.trim() || r.assignmentId?.trim() || r.id);
    };
    const shortageTotalForGroup = (rows: (typeof shipping)[number][]) => {
      if (!hasMovements) return 0;
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      let total = 0;
      for (const sh of rows) {
        const plan = Number(sh.plannedUnits) || 0;
        const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
        if (plan <= 0 || fact >= plan) continue;
        const key = balanceKeyFromOutboundShipment(sh, byProduct.get(sh.productId) ?? null);
        const bal = balanceByKey.get(key) ?? 0;
        const res = resByKey.get(key) ?? 0;
        const available = Math.max(0, bal - res);
        if (plan > available) {
          total += Math.max(0, plan - available);
        }
      }
      return total;
    };

    for (const rows of assignments) {
      if (out.length >= 3) break;
      if (!Array.isArray(rows) || !rows[0]) continue;
      const k = groupKey(rows);
      if (!k || used.has(k)) continue;
      const st = shortageTotalForGroup(rows);
      if (st > 0) {
        used.add(k);
        out.push({ groupKey: k, label: label(rows), line: "shortage", shortageUnits: st });
      }
    }
    for (const rows of assignments) {
      if (out.length >= 3) break;
      if (!Array.isArray(rows) || !rows[0]) continue;
      const k = groupKey(rows);
      if (!k || used.has(k)) continue;
      if (mergePriorityFromShipments(rows) === "high") {
        used.add(k);
        out.push({ groupKey: k, label: label(rows), line: "high" });
      }
    }
    for (const rows of assignments) {
      if (out.length >= 3) break;
      if (!Array.isArray(rows) || !rows[0]) continue;
      const k = groupKey(rows);
      if (!k || used.has(k)) continue;
      if (workflowFromOutboundGroup(rows) === "processing") {
        used.add(k);
        out.push({ groupKey: k, label: label(rows), line: "processing" });
      }
    }
    return out;
  })();

  const shippingTotal = assignments.length;
  const shippingProcessing = assignments.filter((rows) => workflowFromOutboundGroup(rows) === "processing").length;
  const shippingPending = assignments.filter((rows) => workflowFromOutboundGroup(rows) === "pending").length;
  const shippingCompleted = assignments.filter((rows) => workflowFromOutboundGroup(rows) === "completed").length;

  let shippingProblematic = 0;
  if (assignments.length > 0) {
    const balanceByKey = getBalanceByKeyMap(movements);
    const reserveByKey = reservedQtyByBalanceKey(shipping, catalog);
    const byProduct = new Map(catalog.map((p) => [p.id, p]));
    shippingProblematic = assignments.filter((rows) =>
      rows.some((sh) => {
        const plan = Number(sh.plannedUnits) || 0;
        const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
        if (plan <= 0 || fact >= plan) return false;
        const key = balanceKeyFromOutboundShipment(sh, byProduct.get(sh.productId) ?? null);
        const balance = balanceByKey.get(key) ?? 0;
        const reserve = reserveByKey.get(key) ?? 0;
        const available = Math.max(0, balance - reserve);
        return plan > available;
      }),
    ).length;
  }

  const inventorySkuTotal = inventory.length;
  const reserveByKey = reservedQtyByBalanceKey(shipping, catalog);
  const inventoryReserved = inventory.filter((row) => (reserveByKey.get(row.key) ?? 0) > 0).length;
  const inventoryUnavailable = inventory.filter((row) => {
    const reserve = reserveByKey.get(row.key) ?? 0;
    const available = row.balanceQty - reserve;
    return available <= 0;
  }).length;
  const activeAssignmentsInWork = shippingProcessing;
  const attentionItems = [
    shippingProblematic > 0
      ? { id: "shipping-problem", text: "Есть отгрузки с нехваткой товара", path: "/shipping", count: shippingProblematic }
      : null,
    inventoryUnavailable > 0
      ? { id: "inventory-unavailable", text: "Есть товары без доступного остатка", path: "/inventory", count: inventoryUnavailable }
      : null,
    activeAssignmentsInWork > 0
      ? { id: "active-work", text: "Есть активные задания в работе", path: "/packing", count: activeAssignmentsInWork }
      : null,
  ].filter((item): item is { id: string; text: string; path: string; count: number } => item !== null);

  const acceptedUnitsToday = receiving
    .filter((row) => workflowFromInbound(row) === "completed" && isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt))
    .reduce((sum, row) => sum + (Number(row.receivedUnits ?? row.expectedUnits) || 0), 0);

  const shippedUnitsToday = shipping
    .filter((row) => workflowFromOutboundGroup([row]) === "completed" && isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt))
    .reduce((sum, row) => sum + (Number(row.shippedUnits ?? row.packedUnits ?? 0) || 0), 0);

  const inboundCompletedToday = receiving.filter(
    (row) => workflowFromInbound(row) === "completed" && isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt),
  ).length;
  const outboundCompletedToday = assignments.filter((rows) => {
    if (workflowFromOutboundGroup(rows) !== "completed") return false;
    const dateIso = rows
      .map((row) => row.completedAt ?? row.updatedAt ?? row.createdAt)
      .find((iso) => isTodayIso(iso));
    return Boolean(dateIso);
  }).length;
  const completedTasksToday = inboundCompletedToday + outboundCompletedToday;

  const scanErrorsToday = operationLogs.filter((row) => {
    if (!isTodayIso(row.createdAt)) return false;
    return row.type === "SCAN_ERROR";
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Дашборд</h2>
            <Badge variant="secondary" className="border border-slate-200 bg-slate-100 font-normal text-slate-600">
              Global
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">Сводная аналитика по всем юрлицам</p>
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base text-slate-900">Операционный контроль дня</CardTitle>
          <CardDescription className="text-slate-500">Только чтение: оперативная сводка по текущему состоянию</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 md:grid-cols-2 xl:grid-cols-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/receiving")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/receiving");
            }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Приёмка</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-700"><span>Всего</span><span className="tabular-nums font-medium text-slate-900">{receivingTotal || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>В работе</span><span className="tabular-nums font-medium text-slate-900">{receivingProcessing || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>Завершено</span><span className="tabular-nums font-medium text-slate-900">{receivingCompleted || 0}</span></p>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/shipping")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/shipping");
            }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Отгрузки</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-700"><span>Всего</span><span className="tabular-nums font-medium text-slate-900">{shippingTotal || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>В работе</span><span className="tabular-nums font-medium text-slate-900">{shippingProcessing || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>Проблемные</span><span className="tabular-nums font-medium text-slate-900">{shippingProblematic || 0}</span></p>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/packing")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/packing");
            }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Упаковщик</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-700"><span>В очереди</span><span className="tabular-nums font-medium text-slate-900">{shippingPending || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>В работе</span><span className="tabular-nums font-medium text-slate-900">{shippingProcessing || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>Завершено</span><span className="tabular-nums font-medium text-slate-900">{shippingCompleted || 0}</span></p>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate("/inventory")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/inventory");
            }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Остатки</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-700"><span>SKU всего</span><span className="tabular-nums font-medium text-slate-900">{inventorySkuTotal || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>Недоступно</span><span className="tabular-nums font-medium text-slate-900">{inventoryUnavailable || 0}</span></p>
              <p className="flex items-center justify-between text-slate-700"><span>В резерве</span><span className="tabular-nums font-medium text-slate-900">{inventoryReserved || 0}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base text-slate-900">Требует внимания</CardTitle>
          <CardDescription className="text-slate-500">Короткие сигналы по зонам риска</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {attentionItems.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Критичных задач нет
            </div>
          ) : (
            attentionItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(item.path)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(item.path);
                }}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-amber-100/60"
              >
                <span>{item.text}</span>
                <span className="tabular-nums font-medium text-amber-800">{item.count}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base text-slate-900">С чего начать</CardTitle>
          <CardDescription className="text-slate-500">До трёх заданий на отгрузку, на которые стоит обратить внимание</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {startWithTopTasks.length === 0 ? (
            <p className="text-sm text-slate-600">Нет задач для отображения</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {startWithTopTasks.map((row) => (
                <li key={row.groupKey}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate("/shipping")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") navigate("/shipping");
                    }}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-2.5 text-sm text-slate-800 transition-colors hover:bg-slate-50"
                    aria-label={`Перейти к отгрузкам, задание ${row.label}`}
                  >
                    <span
                      className="inline-flex w-5 shrink-0 justify-center text-center text-base leading-tight"
                      aria-hidden
                    >
                      {row.line === "shortage" ? "⚠️" : row.line === "high" ? "🔴" : "\u2003"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 tabular-nums">{row.label}</p>
                      <p className="mt-0.5 text-slate-600">
                        {row.line === "shortage" && row.shortageUnits != null
                          ? `не хватает ${row.shortageUnits} шт`
                          : row.line === "high"
                            ? "высокий приоритет"
                            : "в работе"}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base text-slate-900">Сегодня</CardTitle>
          <CardDescription className="text-slate-500">Ключевые итоги за текущую дату</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Принято товаров сегодня</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-slate-900">{acceptedUnitsToday || 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Отгружено товаров сегодня</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-slate-900">{shippedUnitsToday || 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Завершено заданий сегодня</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-slate-900">{completedTasksToday || 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ошибок сканирования сегодня</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-slate-900">{scanErrorsToday || 0}</p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl border border-slate-200" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[320px] rounded-xl border border-slate-200" />
            <Skeleton className="h-[320px] rounded-xl border border-slate-200" />
          </div>
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">Не удалось загрузить дашборд.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">На хранении</CardTitle>
                <Boxes className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.inStorageUnits.toLocaleString("ru-RU")}
                </p>
                <p className="text-xs text-slate-500">{data.metrics.inStorageSkuCount} SKU</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Очередь на сборку</CardTitle>
                <Package className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.assemblyQueueShipments}
                </p>
                <p className="text-xs text-slate-500">
                  {data.metrics.assemblyQueueShipments} отгрузок · {data.metrics.assemblyQueueUnits} ед.
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Отгружено всего</CardTitle>
                <Truck className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.shippedTotalCount}
                </p>
                <p className="text-xs text-slate-500">отгрузок</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Выручка: услуги</CardTitle>
                <Wallet className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.revenueServicesRub.toLocaleString("ru-RU")} ₽
                </p>
                <p className="text-xs text-slate-500">{data.metrics.revenueServicesOps} операций</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Выручка: хранение</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.revenueStorageRub.toLocaleString("ru-RU")} ₽
                </p>
                <p className="text-xs text-slate-500">{data.metrics.revenueStorageClosedDays} закрытых дней</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-100 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-900">Итого выручка</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-700" />
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                  {data.metrics.revenueTotalRub.toLocaleString("ru-RU")} ₽
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-base text-slate-900">История хранения, ₽/день</CardTitle>
                <CardDescription className="text-slate-500">По выбранному периоду</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.storageHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="valueRub" name="₽/день" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-base text-slate-900">Выручка по клиентам</CardTitle>
                <CardDescription className="text-slate-500">Услуги и хранение</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenueByClient} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" vertical={false} />
                    <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="servicesRub" name="Услуги" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="storageRub" name="Хранение" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="font-display text-base text-slate-900">
                  Текущее хранение по юрлицам · ₽/сутки
                </CardTitle>
                <CardDescription className="text-slate-500">Тарификация демо-остатков</CardDescription>
              </div>
              <p className="text-sm font-medium tabular-nums text-slate-900">
                Итого: {storageTotal.toLocaleString("ru-RU")} ₽
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-4 pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-600">Юрлицо</TableHead>
                    <TableHead className="text-right text-slate-600">Кол-во (шт)</TableHead>
                    <TableHead className="text-right text-slate-600">Тариф (₽/ед)</TableHead>
                    <TableHead className="text-right text-slate-600">Итого (₽/сутки)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.storageByClient.map((row) => (
                    <TableRow key={row.legalEntityId} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">{row.shortName}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{row.quantityUnits.toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">
                        {Number.isInteger(row.tariffPerUnitRub)
                          ? `${row.tariffPerUnitRub} ₽`
                          : `${row.tariffPerUnitRub.toLocaleString("ru-RU")} ₽`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-slate-900">
                        {row.totalPerDayRub.toLocaleString("ru-RU")} ₽
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-base text-slate-900">Последние операции</CardTitle>
              <CardDescription className="text-slate-500">Склад и финансы</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-4 pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-600">Тип</TableHead>
                    <TableHead className="text-slate-600">Юрлицо</TableHead>
                    <TableHead className="text-slate-600">Детали</TableHead>
                    <TableHead className="text-right text-slate-600">Время</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOperations.map((op) => (
                    <TableRow key={op.id} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">{op.kind}</TableCell>
                      <TableCell className="text-slate-700">
                        {data.storageByClient.find((r) => r.legalEntityId === op.legalEntityId)?.shortName ??
                          data.revenueByClient.find((r) => r.legalEntityId === op.legalEntityId)?.shortName ??
                          op.legalEntityId}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-slate-600 text-sm">{op.detail}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-slate-500 text-sm">
                        {format(parseISO(op.date), "d MMM HH:mm", { locale: ru })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
