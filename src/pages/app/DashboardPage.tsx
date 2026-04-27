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
import { cn } from "@/lib/utils";
import { mergePriorityFromShipments, outboundPrioritySortKey, type OutboundTaskPriority } from "@/lib/outboundTaskPriority";
import { isOutboundWorkflowTerminal, workflowFromInbound, workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";
import type { OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { balanceKeyFromOutboundShipment, reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";
import { sumStorageDay } from "@/services/mockDashboardBundle";

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/** Подписи причин расхождений (как при подтверждении отгрузки в приложении). */
const DISCREPANCY_REASON_LABELS = ["Нет товара", "Пересорт", "Повреждение", "Ошибка учёта", "Другое"] as const;

/** Согласовано с агрегацией статуса задания на странице «Отгрузки» (группа строк). */
function dashboardOutboundGroupUiStatus(shipments: OutboundShipment[]): TaskWorkflowStatus | "shipped_with_diff" {
  const perRow = shipments.map((s): TaskWorkflowStatus | "shipped_with_diff" => {
    const wf = (s.workflowStatus ?? "pending") as string;
    if (wf === "shipped_with_diff") return "shipped_with_diff";
    if (wf === "completed") return "assembled";
    if (wf === "processing" || wf === "assembling" || wf === "assembled" || wf === "shipped") return wf;
    if (s.status === "отгружено") return "shipped";
    return "pending";
  });
  if (perRow.some((x) => x === "processing")) return "processing";
  if (perRow.some((x) => x === "assembling")) return "assembling";
  if (perRow.every((x) => x === "shipped_with_diff")) return "shipped_with_diff";
  if (perRow.every((x) => x === "shipped")) return "shipped";
  if (perRow.every((x) => x === "assembled")) return "assembled";
  return "pending";
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
    kind: "shortage" | "shipped_with_diff" | "in_work";
    shortageUnits?: number;
    diffUnits?: number;
    shippingHref: string;
  }> = (() => {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return [];
    }
    const byProduct = new Map(catalog.map((p) => [p.id, p]));
    const balanceByKey = getBalanceByKeyMap(movements);
    const resByKey = reservedQtyByBalanceKey(shipping, catalog);
    const hasMovements = movements.length > 0;

    const groupKeyOf = (rows: (typeof shipping)[number][]) => {
      if (!Array.isArray(rows) || !rows[0]) return "";
      const r = rows[0];
      return `${r.legalEntityId}::${r.assignmentId ?? r.assignmentNo ?? r.id}`;
    };
    const labelOf = (rows: (typeof shipping)[number][]) => {
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
    const diffUnitsForGroup = (rows: (typeof shipping)[number][]) => {
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      return rows.reduce((sum, sh) => {
        const plan = Number(sh.plannedUnits) || 0;
        const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
        return sum + Math.max(0, plan - fact);
      }, 0);
    };

    type StartCand = {
      groupKey: string;
      label: string;
      kind: "shortage" | "shipped_with_diff" | "in_work";
      shortageUnits: number;
      diffUnits: number;
      mergedPriority: OutboundTaskPriority;
      assignOrder: number;
      createdTs: number;
    };

    const tierShortage: StartCand[] = [];
    const tierDiff: StartCand[] = [];
    const tierWork: StartCand[] = [];

    assignments.forEach((rows, assignOrder) => {
      if (!Array.isArray(rows) || !rows[0]) return;
      const gk = groupKeyOf(rows);
      if (!gk) return;
      const st = shortageTotalForGroup(rows);
      const ui = dashboardOutboundGroupUiStatus(rows);
      const wf = workflowFromOutboundGroup(rows);
      const mergedPriority = mergePriorityFromShipments(rows);
      const first = rows[0];
      const rawDate = first?.createdAt ?? first?.updatedAt ?? "";
      const parsed = Date.parse(String(rawDate));
      const createdTs = Number.isFinite(parsed) ? parsed : 0;
      const diffU = diffUnitsForGroup(rows);
      const label = labelOf(rows);

      if (hasMovements && st > 0) {
        tierShortage.push({
          groupKey: gk,
          label,
          kind: "shortage",
          shortageUnits: st,
          diffUnits: diffU,
          mergedPriority,
          assignOrder,
          createdTs,
        });
      } else if (ui === "shipped_with_diff") {
        tierDiff.push({
          groupKey: gk,
          label,
          kind: "shipped_with_diff",
          shortageUnits: st,
          diffUnits: diffU,
          mergedPriority,
          assignOrder,
          createdTs,
        });
      } else if (wf === "processing" || wf === "assembling") {
        tierWork.push({
          groupKey: gk,
          label,
          kind: "in_work",
          shortageUnits: st,
          diffUnits: diffU,
          mergedPriority,
          assignOrder,
          createdTs,
        });
      }
    });

    tierShortage.sort((a, b) => {
      if (b.shortageUnits !== a.shortageUnits) return b.shortageUnits - a.shortageUnits;
      const pa = outboundPrioritySortKey(a.mergedPriority);
      const pb = outboundPrioritySortKey(b.mergedPriority);
      if (pa !== pb) return pa - pb;
      if (a.assignOrder !== b.assignOrder) return a.assignOrder - b.assignOrder;
      return a.createdTs - b.createdTs;
    });
    tierDiff.sort((a, b) => {
      if (b.diffUnits !== a.diffUnits) return b.diffUnits - a.diffUnits;
      return a.createdTs - b.createdTs;
    });
    tierWork.sort((a, b) => {
      const pa = outboundPrioritySortKey(a.mergedPriority);
      const pb = outboundPrioritySortKey(b.mergedPriority);
      if (pa !== pb) return pa - pb;
      if (a.assignOrder !== b.assignOrder) return a.assignOrder - b.assignOrder;
      return a.createdTs - b.createdTs;
    });

    const cap = 3;
    const out: Array<{
      groupKey: string;
      label: string;
      kind: "shortage" | "shipped_with_diff" | "in_work";
      shortageUnits?: number;
      diffUnits?: number;
      shippingHref: string;
    }> = [];

    const push = (c: StartCand) => {
      if (out.length >= cap) return;
      const href =
        c.kind === "shipped_with_diff"
          ? `/shipping?status=shipped_with_diff&openTask=${encodeURIComponent(c.groupKey)}`
          : `/shipping?openTask=${encodeURIComponent(c.groupKey)}`;
      out.push({
        groupKey: c.groupKey,
        label: c.label,
        kind: c.kind,
        shortageUnits: c.kind === "shortage" ? c.shortageUnits : undefined,
        diffUnits: c.kind === "shipped_with_diff" ? c.diffUnits : undefined,
        shippingHref: href,
      });
    };

    for (const c of tierShortage) push(c);
    for (const c of tierDiff) push(c);
    for (const c of tierWork) push(c);
    return out;
  })();

  const shippingTotal = assignments.length;
  const shippingProcessing = assignments.filter((rows) => workflowFromOutboundGroup(rows) === "processing").length;
  const shippingPending = assignments.filter((rows) => workflowFromOutboundGroup(rows) === "pending").length;
  const shippingCompleted = assignments.filter((rows) =>
    isOutboundWorkflowTerminal(workflowFromOutboundGroup(rows)),
  ).length;

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
  const shippingWithDiscrepancy = assignments.filter(
    (rows) => Array.isArray(rows) && rows.length > 0 && dashboardOutboundGroupUiStatus(rows) === "shipped_with_diff",
  ).length;
  const attentionItems = [
    shippingProblematic > 0
      ? {
          id: "shipping-problem",
          text: "Есть отгрузки с нехваткой товара",
          path: "/shipping?problem=shortage",
          count: shippingProblematic,
        }
      : null,
    shippingWithDiscrepancy > 0
      ? {
          id: "shipping-with-diff",
          text: "Есть отгрузки с расхождением",
          path: "/shipping?status=shipped_with_diff",
          count: shippingWithDiscrepancy,
        }
      : null,
    inventoryUnavailable > 0
      ? {
          id: "inventory-unavailable",
          text: "Есть товары без доступного остатка",
          path: "/inventory?available=zero",
          count: inventoryUnavailable,
        }
      : null,
    activeAssignmentsInWork > 0
      ? {
          id: "active-work",
          text: "Есть активные задания в работе",
          path: "/packing?status=processing",
          count: activeAssignmentsInWork,
        }
      : null,
  ].filter((item): item is { id: string; text: string; path: string; count: number } => item !== null);

  const discrepancyReasonStats: Array<{ label: string; count: number }> = (() => {
    const known = new Set<string>([...DISCREPANCY_REASON_LABELS]);
    const counts = new Map<string, number>();
    for (const label of DISCREPANCY_REASON_LABELS) counts.set(label, 0);
    for (const rows of assignments) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      if (dashboardOutboundGroupUiStatus(rows) !== "shipped_with_diff") continue;
      const raw = rows
        .map((s) => String((s as OutboundShipment & { differenceReason?: string }).differenceReason ?? "").trim())
        .find(Boolean) ?? "";
      const bucket = raw && known.has(raw) ? raw : "Другое";
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, c]) => c > 0)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const acceptedUnitsToday = receiving
    .filter((row) => workflowFromInbound(row) === "completed" && isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt))
    .reduce((sum, row) => sum + (Number(row.receivedUnits ?? row.expectedUnits) || 0), 0);

  const shippedUnitsToday = shipping
    .filter(
      (row) =>
        isOutboundWorkflowTerminal(workflowFromOutboundGroup([row])) &&
        isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt),
    )
    .reduce((sum, row) => sum + (Number(row.shippedUnits ?? row.packedUnits ?? 0) || 0), 0);

  const inboundCompletedToday = receiving.filter(
    (row) => workflowFromInbound(row) === "completed" && isTodayIso(row.completedAt ?? row.updatedAt ?? row.createdAt),
  ).length;
  const outboundCompletedToday = assignments.filter((rows) => {
    if (!isOutboundWorkflowTerminal(workflowFromOutboundGroup(rows))) return false;
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
          <CardTitle className="font-display text-base text-slate-900">Причины расхождений</CardTitle>
          <CardDescription className="text-slate-500">
            По отгрузкам со статусом «Отгружено с расхождением», поле причины
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {discrepancyReasonStats.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Нет отгрузок с расхождением или причины не указаны.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {discrepancyReasonStats.map((row) => (
                <li key={row.label} className="min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/shipping?status=shipped_with_diff&reason=${encodeURIComponent(row.label)}`,
                      )
                    }
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50"
                    aria-label={`Открыть отгрузки с причиной «${row.label}»`}
                  >
                    <span>{row.label}</span>
                    <span className="tabular-nums font-medium text-slate-900">{row.count}</span>
                  </button>
                </li>
              ))}
            </ul>
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
            <ul className="space-y-1">
              {startWithTopTasks.map((row, index) => {
                const openTask = () => {
                  if (!row.shippingHref) return;
                  navigate(row.shippingHref);
                };
                const reasonLine =
                  row.kind === "shortage" && row.shortageUnits != null && row.shortageUnits > 0
                    ? `Нехватка: ${row.shortageUnits} шт`
                    : row.kind === "shipped_with_diff"
                      ? `Расхождение: ${row.diffUnits ?? 0} шт`
                      : "В работе";
                const icon =
                  row.kind === "shortage" ? "⚠️" : row.kind === "shipped_with_diff" ? "⚠️" : "\u2003";
                return (
                <li key={`${row.groupKey}-${row.kind}`} className="min-w-0">
                  {index === 0 ? (
                    <p className="mb-1 text-xs font-medium text-slate-500">Рекомендуем начать с:</p>
                  ) : null}
                  <div
                    className={cn(
                      "flex items-stretch gap-2 rounded-lg px-2 py-2.5 text-sm text-slate-800 transition-colors",
                      index === 0
                        ? "bg-slate-100/90 font-semibold ring-1 ring-slate-200/60"
                        : "",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span
                        className="inline-flex w-5 shrink-0 justify-center text-center text-base leading-tight"
                        aria-hidden
                      >
                        {icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("tabular-nums text-slate-900", index === 0 ? "font-semibold" : "font-medium")}>
                          {row.label}
                        </p>
                        <p className={cn("mt-0.5 text-slate-600", index === 0 ? "font-semibold" : "font-normal")}>
                          {reasonLine}
                        </p>
                      </div>
                    </div>
                    {row.shippingHref ? (
                      <button
                        type="button"
                        onClick={openTask}
                        className="shrink-0 self-center cursor-pointer rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                        aria-label={`Открыть задачу ${row.label}`}
                      >
                        Открыть задачу
                      </button>
                    ) : null}
                  </div>
                </li>
                );
              })}
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
