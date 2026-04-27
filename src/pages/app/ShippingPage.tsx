import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import TaskItemsTable, { type TaskItemRow } from "@/components/app/TaskItemsTable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import StatusBadge from "@/components/app/StatusBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useInventoryMovements, useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";
import { formatTaskArchiveDateLabel, outboundArchiveSortKey, outboundShipmentsCompletedAtIso } from "@/lib/taskArchiveDates";
import { cn } from "@/lib/utils";
import {
  mergePriorityFromShipments,
  outboundPriorityBadgeClass,
  outboundPriorityLabel,
  type OutboundTaskPriority,
} from "@/lib/outboundTaskPriority";
import { balanceKeyFromOutboundShipment, reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";

type ShipmentDoc = {
  id: string;
  legalEntityId: string;
  assignmentNo: string;
  createdAt: string;
  completedAtIso?: string;
  sourceWarehouse: string;
  marketplace: Marketplace;
  planned: number;
  fact: number;
  differenceReason?: string;
  shipments: OutboundShipment[];
  workflowStatus: TaskWorkflowStatus | "shipped_with_diff";
  priority: OutboundTaskPriority;
};

type ShippingUiStatus = TaskWorkflowStatus | "shipped_with_diff";

function shippingDispatcherHint(status: ShippingUiStatus): string {
  if (status === "pending") return "Задание создано и ожидает сборки";
  if (status === "processing") return "Задание находится в сборке";
  if (status === "assembling") return "Задание в сборке на складе";
  if (status === "assembled") return "Задание собрано, ожидает отгрузки";
  if (status === "shipped") return "Отгрузка завершена";
  if (status === "shipped_with_diff") return "Отгрузка завершена с расхождением";
  return "Сборка завершена";
}

function shippingStageIndex(status: ShippingUiStatus): number {
  if (status === "shipped" || status === "shipped_with_diff") return 3;
  if (status === "assembled") return 2;
  if (status === "processing" || status === "assembling") return 1;
  return 0;
}

function isShippingTerminal(status: ShippingUiStatus): boolean {
  return status === "shipped" || status === "shipped_with_diff";
}

function shippingWorkflowFromGroup(shipments: OutboundShipment[]): ShippingUiStatus {
  const perRow = shipments.map((s): ShippingUiStatus => {
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

type ShippingStockWarnLine = { barcode: string; plan: number; available: number; shortage: number };

function shippingAvailableFromBalanceReserve(balance: number, reserve: number): number {
  return Math.max(0, balance - reserve);
}

function shippingShortage(plan: number, available: number): number {
  return Math.max(0, plan - available);
}

function formatShippingStockTooltip(lines: ShippingStockWarnLine[]): string {
  if (!lines.length) return "";
  if (lines.length === 1) {
    const L = lines[0];
    return [
      "Недостаточно доступного товара.",
      "",
      `План: ${L.plan.toLocaleString("ru-RU")}`,
      `Доступно: ${L.available.toLocaleString("ru-RU")}`,
      `Не хватает: ${L.shortage.toLocaleString("ru-RU")} шт`,
      `Баркод: ${L.barcode}`,
    ].join("\n");
  }
  const intro = `Недостаточно доступного товара по ${lines.length} позициям.`;
  const list = lines.map((L) => `- Баркод ${L.barcode}: не хватает ${L.shortage.toLocaleString("ru-RU")} шт`).join("\n");
  return `${intro}\n\n${list}`;
}

function ShippingStockWarnTrigger({
  tooltip,
  ariaLabel,
  children,
}: {
  tooltip: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help select-none border-0 bg-transparent p-0 text-[13px] leading-none text-amber-600 hover:text-amber-700"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-sm whitespace-pre-line text-left text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

const ShippingPage = () => {
  const DIFF_REASONS = React.useMemo(
    () => ["Нет товара", "Пересорт", "Повреждение", "Ошибка учёта", "Другое"],
    [],
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data, isLoading, error, updateOutboundDraft, isUpdatingOutboundDraft } = useOutboundShipments();
  const { data: inventoryMovements = [] } = useInventoryMovements();
  const { data: catalog } = useProductCatalog();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus | "shipped_with_diff">("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const openTaskRowRef = React.useRef<HTMLTableRowElement | null>(null);
  const urlOpenTaskApplied = React.useRef<string | null>(null);
  const openTaskScrollDone = React.useRef<string | null>(null);
  const [openTaskHighlightId, setOpenTaskHighlightId] = React.useState<string | null>(null);
  const [confirmingShipmentId, setConfirmingShipmentId] = React.useState<string | null>(null);
  const [diffReasonDialogOpen, setDiffReasonDialogOpen] = React.useState(false);
  const [pendingDiffDoc, setPendingDiffDoc] = React.useState<ShipmentDoc | null>(null);
  const [selectedDiffReason, setSelectedDiffReason] = React.useState<string>("");

  const openTaskParam = searchParams.get("openTask");
  /** Диплинк с дашборда: показать только отгрузки с расхождением (в архиве — терминальный статус). */
  React.useEffect(() => {
    if (searchParams.get("status") !== "shipped_with_diff") return;
    setStatusFilter("shipped_with_diff");
    setViewMode("archive");
  }, [searchParams]);

  const openTaskDecoded = React.useMemo(() => {
    if (!openTaskParam) return null;
    try {
      return decodeURIComponent(openTaskParam);
    } catch {
      return openTaskParam;
    }
  }, [openTaskParam]);

  const filtered = React.useMemo(() => {
    const base = filterOutboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((x) => x.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);

  const documents = React.useMemo(() => {
    const groups = new Map<string, OutboundShipment[]>();
    for (const x of filtered) {
      const key = `${x.legalEntityId}::${x.assignmentId ?? x.assignmentNo ?? x.id}`;
      const cur = groups.get(key) ?? [];
      cur.push(x);
      groups.set(key, cur);
    }
    const docs: ShipmentDoc[] = [];
    for (const [, shipments] of groups) {
      const first = shipments[0];
      const createdAt = shipments.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), first.createdAt);
      const planned = shipments.reduce((s, sh) => s + (Number(sh.plannedUnits) || 0), 0);
      const fact = shipments.reduce((s, sh) => s + (Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0), 0);
      const workflowStatus = shippingWorkflowFromGroup(shipments);
      const priority = mergePriorityFromShipments(shipments);
      const groupId = `${first.legalEntityId}::${first.assignmentId ?? first.assignmentNo ?? first.id}`;
      docs.push({
        id: groupId,
        legalEntityId: first.legalEntityId,
        assignmentNo: first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id,
        createdAt,
        completedAtIso: outboundShipmentsCompletedAtIso(shipments),
        sourceWarehouse: first.sourceWarehouse,
        marketplace: first.marketplace,
        planned,
        fact,
        differenceReason:
          shipments
            .map((s) => ((s as OutboundShipment & { differenceReason?: string }).differenceReason ?? "").trim())
            .find(Boolean) || undefined,
        shipments,
        workflowStatus,
        priority,
      });
    }
    const q = search.trim().toLowerCase();
    const searched = !q
      ? docs
      : docs.filter((d) => {
          const entity = entities?.find((e) => e.id === d.legalEntityId)?.shortName ?? d.legalEntityId;
          const lines = d.shipments
            .map((s) => `${s.importArticle ?? ""} ${s.importBarcode ?? ""} ${s.importName ?? ""}`)
            .join(" ")
            .toLowerCase();
          return `${entity} ${d.assignmentNo} ${lines}`.toLowerCase().includes(q);
        });
    const withFilters = searched.filter((d) => {
      if (viewMode === "active" && isShippingTerminal(d.workflowStatus)) return false;
      if (viewMode === "archive" && !isShippingTerminal(d.workflowStatus)) return false;
      if (statusFilter !== "all" && d.workflowStatus !== statusFilter) return false;
      if (warehouseFilter !== "all" && d.sourceWarehouse !== warehouseFilter) return false;
      const created = Date.parse(d.createdAt || "");
      if (dateFrom) {
        const from = Date.parse(`${dateFrom}T00:00:00`);
        if (Number.isFinite(from) && created < from) return false;
      }
      if (dateTo) {
        const to = Date.parse(`${dateTo}T23:59:59`);
        if (Number.isFinite(to) && created > to) return false;
      }
      return true;
    });
    return withFilters.sort((a, b) => {
      if (viewMode === "archive") {
        return outboundArchiveSortKey(b.shipments) - outboundArchiveSortKey(a.shipments);
      }
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
  }, [filtered, search, entities, viewMode, statusFilter, warehouseFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    if (isLoading || error) return;
    if (!openTaskDecoded) {
      urlOpenTaskApplied.current = null;
      return;
    }
    if (urlOpenTaskApplied.current === openTaskDecoded) return;
    const list = Array.isArray(documents) ? documents : [];
    const found = list.find((d) => d && d.id === openTaskDecoded);
    if (found) {
      setSelectedId(openTaskDecoded);
      urlOpenTaskApplied.current = openTaskDecoded;
    }
  }, [isLoading, error, openTaskDecoded, documents]);

  React.useEffect(() => {
    if (!openTaskDecoded) {
      openTaskScrollDone.current = null;
    }
  }, [openTaskDecoded]);

  React.useEffect(() => {
    if (!openTaskDecoded) {
      setOpenTaskHighlightId(null);
    }
  }, [openTaskDecoded]);

  React.useEffect(() => {
    if (!openTaskHighlightId) return;
    const t = window.setTimeout(() => setOpenTaskHighlightId(null), 1800);
    return () => window.clearTimeout(t);
  }, [openTaskHighlightId]);

  /** После раскрытия состава: прокрутка к центру экрана и краткая подсветка (только openTask). */
  React.useEffect(() => {
    if (!openTaskDecoded || selectedId !== openTaskDecoded) return;
    if (openTaskScrollDone.current === openTaskDecoded) return;
    let cancelled = false;

    const tryScroll = (): boolean => {
      const el = openTaskRowRef.current;
      if (!el) return false;
      if (cancelled) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (cancelled) return false;
      openTaskScrollDone.current = openTaskDecoded;
      setOpenTaskHighlightId(openTaskDecoded);
      return true;
    };

    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = window.setTimeout(() => {
      if (cancelled) return;
      if (tryScroll()) return;
      t2 = window.setTimeout(() => {
        if (cancelled) return;
        if (openTaskScrollDone.current === openTaskDecoded) return;
        tryScroll();
      }, 280);
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [openTaskDecoded, selectedId, documents.length]);

  /**
   * ⚠️ только при наличии строк, где: plan>0, fact<plan, plan>доступно, доступно=max(0, остаток−резерв).
   * Не опираемся на статус задания: только критерии по строке. Без движений WMS — пусто.
   */
  const shippingDocStockWarning = React.useMemo(() => {
    const map = new Map<string, { lines: ShippingStockWarnLine[] }>();
    const empty = () => ({ lines: [] as ShippingStockWarnLine[] });
    if (!inventoryMovements.length) {
      for (const doc of documents) map.set(doc.id, empty());
      return map;
    }
    const balanceByKey = getBalanceByKeyMap(inventoryMovements);
    const reserveByKey = reservedQtyByBalanceKey(data ?? [], catalog ?? []);
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    for (const doc of documents) {
      const lines: ShippingStockWarnLine[] = [];
      for (const sh of doc.shipments) {
        const plan = Number(sh.plannedUnits) || 0;
        if (plan <= 0) continue;
        const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
        if (fact >= plan) continue;
        const product = byProduct.get(sh.productId) ?? null;
        const key = balanceKeyFromOutboundShipment(sh, product);
        const balanceQty = balanceByKey.get(key) ?? 0;
        const reserveQty = reserveByKey.get(key) ?? 0;
        const available = shippingAvailableFromBalanceReserve(balanceQty, reserveQty);
        if (plan > available) {
          const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
          lines.push({ barcode, plan, available, shortage: shippingShortage(plan, available) });
        }
      }
      map.set(doc.id, { lines });
    }
    return map;
  }, [documents, inventoryMovements, data, catalog]);

  const selectedDoc = documents.find((x) => x.id === selectedId) ?? null;

  /** Строки отгрузки из хранилища часто без import* — подставляем поля из каталога по productId (как в упаковщике). */
  const selectedShipmentItemRows = React.useMemo<TaskItemRow[]>(() => {
    if (!selectedDoc?.shipments?.length) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    const showStock = !isShippingTerminal(selectedDoc.workflowStatus);
    const movementsReady = inventoryMovements.length > 0;
    const balanceByKey = showStock && movementsReady ? getBalanceByKeyMap(inventoryMovements) : null;
    const reserveByKey = showStock && movementsReady ? reservedQtyByBalanceKey(data ?? [], catalog ?? []) : null;
    return selectedDoc.shipments.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const name = (sh.importName || product?.name || "").trim() || "—";
      const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      const color = (sh.importColor || product?.color || "").trim() || "—";
      const size = (sh.importSize || product?.size || "").trim() || "—";
      const plan = Number(sh.plannedUnits) || 0;
      const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
      let shippingStock: TaskItemRow["shippingStock"] = undefined;
      if (showStock && balanceByKey && reserveByKey) {
        const key = balanceKeyFromOutboundShipment(sh, product);
        const balanceQty = balanceByKey.get(key) ?? 0;
        const reserveQty = reserveByKey.get(key) ?? 0;
        const available = shippingAvailableFromBalanceReserve(balanceQty, reserveQty);
        if (fact >= plan) {
          shippingStock = { state: "sufficient" };
        } else if (plan > available) {
          shippingStock = { state: "short", available, shortage: shippingShortage(plan, available) };
        } else {
          shippingStock = { state: "sufficient" };
        }
      }
      return {
        id: sh.id,
        name,
        article,
        barcode,
        marketplace: sh.marketplace.toUpperCase(),
        color,
        size,
        plan,
        fact,
        warehouse: sh.sourceWarehouse || "—",
        status: sh.workflowStatus ?? "pending",
        shippingStock,
      };
    });
  }, [selectedDoc, catalog, inventoryMovements, data]);

  const warehouses = React.useMemo(() => Array.from(new Set(documents.map((d) => d.sourceWarehouse))).filter(Boolean), [documents]);

  const goToPacker = React.useCallback(
    (assignmentId: string) => {
      navigate(`/packing?openAssignment=${encodeURIComponent(assignmentId)}`);
    },
    [navigate],
  );

  const confirmShipment = React.useCallback(
    async (doc: ShipmentDoc) => {
      if (doc.workflowStatus !== "assembled") return;
      if (confirmingShipmentId === doc.id) return;
      const hasDiff = doc.fact < doc.planned;
      if (hasDiff) {
        setPendingDiffDoc(doc);
        setSelectedDiffReason("");
        setDiffReasonDialogOpen(true);
        return;
      }
      setConfirmingShipmentId(doc.id);
      const ts = new Date().toISOString();
      try {
        for (const sh of doc.shipments) {
          await updateOutboundDraft({
            id: sh.id,
            patch: {
              workflowStatus: "shipped",
              completedAt: sh.completedAt ?? ts,
              updatedAt: ts,
            },
          });
        }
      } finally {
        setConfirmingShipmentId(null);
      }
    },
    [updateOutboundDraft, confirmingShipmentId],
  );

  const submitDiffShipmentConfirm = React.useCallback(async () => {
    if (!pendingDiffDoc || pendingDiffDoc.workflowStatus !== "assembled") return;
    if (!selectedDiffReason) return;
    if (confirmingShipmentId === pendingDiffDoc.id) return;
    setConfirmingShipmentId(pendingDiffDoc.id);
    const ts = new Date().toISOString();
    try {
      for (const sh of pendingDiffDoc.shipments) {
        const patch: Partial<OutboundShipment> & { differenceReason?: string } = {
            workflowStatus: "shipped_with_diff" as TaskWorkflowStatus,
            completedAt: sh.completedAt ?? ts,
            updatedAt: ts,
            differenceReason: selectedDiffReason,
          };
        await updateOutboundDraft({
          id: sh.id,
          patch,
        });
      }
      setDiffReasonDialogOpen(false);
      setPendingDiffDoc(null);
      setSelectedDiffReason("");
    } finally {
      setConfirmingShipmentId(null);
    }
  }, [pendingDiffDoc, selectedDiffReason, confirmingShipmentId, updateOutboundDraft]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Задания на выдачу со склада FF и контроль остатков.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            <Button
              type="button"
              variant={viewMode === "active" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode("active")}
            >
              Активные
            </Button>
            <Button
              type="button"
              variant={viewMode === "archive" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode("archive")}
            >
              Архив
            </Button>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: №, юрлицо, артикул, баркод" className="w-[280px]" />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | TaskWorkflowStatus | "shipped_with_diff")}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">Новое</SelectItem>
              <SelectItem value="processing">В работе</SelectItem>
              <SelectItem value="assembling">В сборке</SelectItem>
              <SelectItem value="assembled">Собрано</SelectItem>
              <SelectItem value="shipped">Отгружено</SelectItem>
              <SelectItem value="shipped_with_diff">С расхождением</SelectItem>
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Склад" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {warehouses.map((wh) => <SelectItem key={wh} value={wh}>{wh}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Реестр заданий на отгрузку</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          {isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-36 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить отгрузки.</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-600">
              {viewMode === "active" ? "Нет активных заданий для отображения." : "Архив отгрузок пуст."}
            </p>
          ) : (
            <>
              <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border border-slate-200">
                <Table className="min-w-[1280px] table-auto">
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата создания</TableHead>
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата завершения</TableHead>
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">№ задания</TableHead>
                      <TableHead className="h-9 min-w-[120px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Приоритет</TableHead>
                      <TableHead className="h-9 min-w-[180px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                      <TableHead className="h-9 min-w-[130px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
                      <TableHead className="h-9 min-w-[180px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
                      <TableHead className="h-9 min-w-[120px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Маркетплейс</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">План</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Факт</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Перерасход</TableHead>
                      <TableHead className="h-9 w-[110px] whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const uiStatus = shippingWorkflowFromGroup(doc.shipments);
                      const currentStage = shippingStageIndex(uiStatus);
                      const rem = Math.max(0, doc.planned - doc.fact);
                      const over = Math.max(0, doc.fact - doc.planned);
                      const isSel = selectedId === doc.id;
                      const legalLabel = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
                      const stockWarnLines = shippingDocStockWarning.get(doc.id)?.lines ?? [];
                      const stockWarnTooltip = formatShippingStockTooltip(stockWarnLines);
                      const showStockWarn = stockWarnLines.length > 0;
                      const hasShippingProblem = !isShippingTerminal(uiStatus) && (showStockWarn || rem > 0 || doc.fact < doc.planned);
                      const stockWarnAria =
                        stockWarnLines.length === 1
                          ? "Недостаточно доступного товара по одной позиции. Подробности в подсказке."
                          : `Недостаточно доступного товара по ${stockWarnLines.length} позициям. Подробности в подсказке.`;
                      return (
                        <React.Fragment key={doc.id}>
                          <TableRow
                            ref={openTaskDecoded === doc.id ? openTaskRowRef : undefined}
                            className={cn(
                              "cursor-pointer border-slate-100 text-sm transition-[background-color,box-shadow] duration-300",
                              isSel ? "bg-slate-50" : "",
                              uiStatus === "pending" ? "bg-blue-50/60" : "",
                              uiStatus === "assembling" ? "bg-sky-50/70" : "",
                              uiStatus === "assembled" ? "bg-emerald-50/50" : "",
                              uiStatus === "shipped_with_diff" ? "bg-amber-50/60" : "",
                              openTaskHighlightId === doc.id &&
                                "z-[1] ring-2 ring-amber-400/50 ring-inset bg-amber-50/50",
                            )}
                            onClick={() => setSelectedId((p) => (p === doc.id ? null : doc.id))}
                          >
                            <TableCell className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {doc.createdAt ? format(parseISO(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: ru }) : "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                              {formatTaskArchiveDateLabel(doc.completedAtIso)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 font-medium">
                              {uiStatus === "shipped_with_diff" ? (
                                <span className="mr-1 inline-block text-amber-600" title="Отгружено с расхождением" aria-hidden>
                                  ⚠
                                </span>
                              ) : null}
                              {doc.assignmentNo}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${outboundPriorityBadgeClass(doc.priority)}`}
                              >
                                {outboundPriorityLabel(doc.priority)}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2">{legalLabel}</TableCell>
                            <TableCell className="px-3 py-2">
                              <div className="inline-flex flex-wrap items-center gap-1">
                                {uiStatus === "shipped_with_diff" ? (
                                  <span className="inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-amber-100 text-amber-800 ring-amber-200">
                                    Отгружено с расхождением
                                  </span>
                                ) : (
                                  <StatusBadge status={uiStatus} />
                                )}
                                {showStockWarn ? (
                                  <ShippingStockWarnTrigger tooltip={stockWarnTooltip} ariaLabel={stockWarnAria}>
                                    <span aria-hidden>⚠️</span>
                                  </ShippingStockWarnTrigger>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2">{doc.sourceWarehouse}</TableCell>
                            <TableCell className="px-3 py-2">{doc.marketplace.toUpperCase()}</TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{doc.planned}</TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{doc.fact}</TableCell>
                            <TableCell
                              className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                doc.planned > doc.fact ? "font-medium text-amber-800" : doc.planned < doc.fact ? "font-medium text-red-700" : ""
                              }`}
                            >
                              {rem}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${over > 0 ? "font-medium text-red-700" : ""}`}>
                              {over}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 hover:bg-slate-50"
                                onClick={() => setSelectedId((p) => (p === doc.id ? null : doc.id))}
                              >
                                {isSel ? "Свернуть" : "Открыть"}
                              </button>
                            </TableCell>
                          </TableRow>
                          {isSel ? (
                            <TableRow className="border-slate-100 bg-slate-50/90">
                              <TableCell colSpan={13} className="align-top p-0">
                                <div className="space-y-4 border-t border-slate-200 p-4">
                                  <div>
                                    <h3 className="font-display text-base font-semibold text-slate-900">Задание №{doc.assignmentNo}</h3>
                                    <p className="mt-1 text-sm text-slate-600">{shippingDispatcherHint(uiStatus)}</p>
                                  </div>
                                  <div className="rounded-md border border-slate-200 bg-white p-3">
                                    <p className="mb-2 text-xs font-medium text-slate-600">Этапы отгрузки</p>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                      {[
                                        { id: "pending", label: "Новое", order: 0 },
                                        { id: "processing", label: "В работе", order: 1 },
                                        { id: "assembled", label: "Собрано", order: 2 },
                                        { id: "shipped", label: "Отгружено", order: 3 },
                                      ].map((stage) => {
                                        const passed = currentStage > stage.order;
                                        const current = currentStage === stage.order;
                                        const shippedWithDiffCurrent =
                                          stage.id === "shipped" && current && uiStatus === "shipped_with_diff";
                                        return (
                                          <div
                                            key={stage.id}
                                            className={cn(
                                              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                                              passed && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                              current && "border-violet-200 bg-violet-50 text-violet-700",
                                              shippedWithDiffCurrent && "border-amber-200 bg-amber-50 text-amber-800",
                                              !passed && !current && "border-slate-200 bg-slate-50 text-slate-500",
                                            )}
                                          >
                                            <span aria-hidden>{passed ? "✓" : "•"}</span>
                                            <span>
                                              {stage.label}
                                              {shippedWithDiffCurrent ? " (с расхождением)" : ""}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {hasShippingProblem ? (
                                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
                                      <p className="text-sm font-medium text-amber-800">⚠ Не хватает товара</p>
                                      <p className="text-xs text-amber-800/90">
                                        Товаров не хватает. Можно перейти в приёмку для пополнения или продолжить сборку с расхождением.
                                      </p>
                                      <Button type="button" size="sm" variant="outline" onClick={() => navigate("/receiving")}>
                                        Перейти в приёмку
                                      </Button>
                                    </div>
                                  ) : null}
                                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                      <span className="text-slate-500">Юрлицо</span>
                                      <div className="font-medium text-slate-900">{legalLabel}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Склад</span>
                                      <div className="font-medium text-slate-900">{doc.sourceWarehouse}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Статус</span>
                                      <div className="mt-0.5 inline-flex flex-wrap items-center gap-1">
                                        {uiStatus === "shipped_with_diff" ? (
                                          <span className="inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-amber-100 text-amber-800 ring-amber-200">
                                            Отгружено с расхождением
                                          </span>
                                        ) : (
                                          <StatusBadge status={uiStatus} />
                                        )}
                                        {showStockWarn ? (
                                          <ShippingStockWarnTrigger tooltip={stockWarnTooltip} ariaLabel={stockWarnAria}>
                                            <span aria-hidden>⚠️</span>
                                          </ShippingStockWarnTrigger>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">МП</span>
                                      <div className="font-medium text-slate-900">{doc.marketplace.toUpperCase()}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">План</span>
                                      <div className="font-medium tabular-nums text-slate-900">{doc.planned}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Факт</span>
                                      <div className="font-medium tabular-nums text-slate-900">{doc.fact}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Осталось</span>
                                      <div className={`font-medium tabular-nums ${rem > 0 ? "text-amber-800" : "text-slate-900"}`}>{rem}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Перерасход</span>
                                      <div className={`font-medium tabular-nums ${over > 0 ? "text-red-700" : "text-slate-900"}`}>{over}</div>
                                    </div>
                                  </div>
                                  {(doc.planned > doc.fact || doc.fact > doc.planned) && (
                                    <div className="flex flex-wrap gap-3 text-sm">
                                      {doc.planned > doc.fact ? (
                                        <span className="font-medium text-amber-800">Осталось: {rem}</span>
                                      ) : null}
                                      {doc.fact > doc.planned ? <span className="font-medium text-red-700">Перерасход: {over}</span> : null}
                                    </div>
                                  )}
                                  {uiStatus === "shipped_with_diff" ? (
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium text-amber-800">Расхождение: {Math.max(0, doc.planned - doc.fact)} шт</p>
                                      <p className="text-sm text-amber-800">Причина: {doc.differenceReason || "—"}</p>
                                    </div>
                                  ) : null}
                                  {viewMode === "archive" ? null : (
                                    <div className="flex flex-wrap items-center gap-2">
                                      {uiStatus === "assembled" ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => void confirmShipment(doc)}
                                          disabled={confirmingShipmentId === doc.id || isUpdatingOutboundDraft}
                                        >
                                          Подтвердить отгрузку
                                        </Button>
                                      ) : uiStatus === "shipped" ? (
                                        <p className="text-sm font-medium text-emerald-700">Отгрузка подтверждена</p>
                                      ) : uiStatus === "shipped_with_diff" ? (
                                        <p className="text-sm font-medium text-amber-700">Отгружено с расхождением</p>
                                      ) : isShippingTerminal(uiStatus) ? (
                                        <Button type="button" size="sm" variant="secondary" disabled>
                                          {uiStatus === "shipped" ? "Отгружено" : "Сборка завершена"}
                                        </Button>
                                      ) : uiStatus === "processing" || uiStatus === "assembling" ? (
                                        <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                          {hasShippingProblem ? "Продолжить с расхождением" : "Продолжить сборку"}
                                        </Button>
                                      ) : (
                                        <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                          Открыть в упаковщике
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <p className="mb-2 text-xs font-medium text-slate-600">Состав задания</p>
                                    {selectedShipmentItemRows.length === 0 ? (
                                      <p className="text-sm text-slate-600">Состав задания не найден</p>
                                    ) : (
                                      <TaskItemsTable variant="outboundLines" rows={selectedShipmentItemRows} />
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={diffReasonDialogOpen}
        onOpenChange={(open) => {
          setDiffReasonDialogOpen(open);
          if (!open) {
            setPendingDiffDoc(null);
            setSelectedDiffReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Укажите причину расхождения</DialogTitle>
            <DialogDescription>Факт меньше плана. Перед подтверждением выберите причину.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {DIFF_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedDiffReason(reason)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selectedDiffReason === reason
                    ? "border-violet-300 bg-violet-50 text-violet-900"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiffReasonDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => void submitDiffShipmentConfirm()}
              disabled={!selectedDiffReason || !pendingDiffDoc || confirmingShipmentId === pendingDiffDoc.id}
            >
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShippingPage;
