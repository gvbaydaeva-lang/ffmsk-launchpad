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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import StatusBadge from "@/components/app/StatusBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import {
  useInventoryMovements,
  useLegalEntities,
  useLocations,
  useOperationLogs,
  useOutboundShipments,
  useProductCatalog,
} from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type {
  InventoryMovement,
  Location,
  Marketplace,
  OperationLog,
  OutboundShipment,
  ProductCatalogItem,
  TaskWorkflowStatus,
} from "@/types/domain";
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
import { makeInventoryBalanceKeyFromMovement } from "@/lib/inventoryBalanceKey";
import { formatOperationLogDescription, formatOperationLogShortStatus } from "@/lib/operationLogDisplay";
import { getBalanceByKeyMap } from "@/services/mockInventoryMovements";
import { toast } from "sonner";

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

function addShipmentOperationLogKey(set: Set<string>, value: string | undefined | null) {
  const t = String(value ?? "").trim();
  if (t) set.add(t);
}

/** Ключи задания для сопоставления с `OperationLog.taskId` / `taskNumber` (журнал WMS). */
function shipmentDocOperationLogKeys(doc: ShipmentDoc): Set<string> {
  const keys = new Set<string>();
  addShipmentOperationLogKey(keys, doc.id);
  addShipmentOperationLogKey(keys, doc.assignmentNo);
  for (const sh of doc.shipments) {
    addShipmentOperationLogKey(keys, sh.assignmentNo);
    addShipmentOperationLogKey(keys, sh.assignmentId);
    addShipmentOperationLogKey(keys, `${doc.legalEntityId}::${sh.assignmentId ?? sh.assignmentNo ?? sh.id}`);
  }
  return keys;
}

function operationLogBelongsToShipmentDoc(doc: ShipmentDoc, log: OperationLog): boolean {
  const keys = shipmentDocOperationLogKeys(doc);
  const tid = String(log.taskId ?? "").trim();
  const tn = String(log.taskNumber ?? "").trim();
  if (tid && keys.has(tid)) return true;
  if (tn && keys.has(tn)) return true;
  return false;
}

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
type ShippingLocationAvailabilityLine = { locationId: string; label: string; available: number };
type ShippingLocationAvailability = {
  storage: ShippingLocationAvailabilityLine[];
  other: Array<{ label: string; available: number }>;
  storageAvailableTotal: number;
};

function shippingAvailableFromBalanceReserve(balance: number, reserve: number): number {
  return Math.max(0, balance - reserve);
}

function shippingShortage(plan: number, available: number): number {
  return Math.max(0, plan - available);
}

/** Остатки по местам: логика отгрузки использует только storage, receiving/без места — только в «Прочее». */
function shipmentLineAvailableByLocations(params: {
  movements: InventoryMovement[];
  locationById: Map<string, Location>;
  storageLocationIds: Set<string>;
  receivingLocationIds: Set<string>;
  balanceKey: string;
  warehouseName: string;
  /** Оставлено в сигнатуре для совместимости вызовов; числа по ячейкам = сырой остаток, как в «Остатках». */
  reserveQty: number;
}): ShippingLocationAvailability {
  void params.reserveQty;
  const movementsSafe = Array.isArray(params.movements) ? params.movements : [];
  const wh = (params.warehouseName || "").trim() || "—";
  const byLoc = new Map<string, number>();
  for (const m of movementsSafe) {
    const mWh = (m.warehouseName ?? "—").trim() || "—";
    if (mWh !== wh) continue;
    if (makeInventoryBalanceKeyFromMovement(m) !== params.balanceKey) continue;
    const lid = (m.locationId || "").trim();
    const k = lid || "__no_location__";
    byLoc.set(k, (byLoc.get(k) ?? 0) + m.qty);
  }
  const allEntries = [...byLoc.entries()]
    .map(([k, balance]) => ({
      k,
      balance,
      label:
        k === "__no_location__"
          ? "Без места"
          : params.receivingLocationIds.has(k)
            ? (params.locationById.get(k)?.name ?? "ПРИЕМКА")
            : (params.locationById.get(k)?.name ?? "Без места"),
    }))
    .filter((e) => e.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const storageEntries = allEntries.filter((e) => params.storageLocationIds.has(e.k));
  const otherEntries = allEntries.filter((e) => !params.storageLocationIds.has(e.k));

  // Как на странице «Остатки»: сумма qty по ключу строки и locationId (буквальный физический остаток в ячейке).
  // Резерв здесь не вычитаем по ячейкам — иначе визуал не совпадает с таблицей остатков.
  const storage: ShippingLocationAvailabilityLine[] = storageEntries
    .slice()
    .sort((a, b) => b.balance - a.balance)
    .map((e) => ({
      locationId: e.k,
      label: e.label,
      available: e.balance,
    }));
  const other = otherEntries.map((e) => ({ label: e.label, available: e.balance }));
  const storageAvailableTotal = storage.reduce((sum, x) => sum + x.available, 0);
  return { storage, other, storageAvailableTotal };
}

/** Та же логика, что для ⚠ нехватки: plan>0, fact<plan, plan>доступно, доступно=max(0, остаток−резерв). Без движений — пусто. */
function shippingStockShortageLinesForDoc(
  doc: ShipmentDoc,
  inventoryMovements: InventoryMovement[],
  locationById: Map<string, Location>,
  storageLocationIds: Set<string>,
  receivingLocationIds: Set<string>,
  outboundRows: OutboundShipment[] | undefined,
  catalog: ProductCatalogItem[] | undefined,
): ShippingStockWarnLine[] {
  if (!inventoryMovements.length) return [];
  const balanceByKey = getBalanceByKeyMap(inventoryMovements);
  const reserveByKey = reservedQtyByBalanceKey(outboundRows ?? [], catalog ?? []);
  const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
  const lines: ShippingStockWarnLine[] = [];
  for (const sh of doc.shipments) {
    const plan = Number(sh.plannedUnits) || 0;
    if (plan <= 0) continue;
    const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
    if (fact >= plan) continue;
    const product = byProduct.get(sh.productId) ?? null;
    const key = balanceKeyFromOutboundShipment(sh, product);
    const reserveQty = reserveByKey.get(key) ?? 0;
    const locationsBreakdown = shipmentLineAvailableByLocations({
      movements: inventoryMovements,
      locationById,
      storageLocationIds,
      receivingLocationIds,
      balanceKey: key,
      warehouseName: sh.sourceWarehouse || "",
      reserveQty,
    });
    const available = locationsBreakdown.storageAvailableTotal;
    if (plan > available) {
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      lines.push({ barcode, plan, available, shortage: shippingShortage(plan, available) });
    }
  }
  return lines;
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
  const { data: inventoryMovements = [], addInventoryMovements, isAppending: isAppendingMovements } = useInventoryMovements();
  const { data: locationsData } = useLocations();
  const { data: catalog } = useProductCatalog();
  const { data: entities } = useLegalEntities();
  const { data: operationLogsRaw } = useOperationLogs();
  const { legalEntityId } = useAppFilters();
  useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus | "shipped_with_diff">("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  type ShippingQuickFilter = "all" | "problematic" | "shortage" | "shipped_with_diff" | "assembled";
  const [shippingQuickFilter, setShippingQuickFilter] = React.useState<ShippingQuickFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const openTaskRowRef = React.useRef<HTMLTableRowElement | null>(null);
  const urlOpenTaskApplied = React.useRef<string | null>(null);
  const openTaskScrollDone = React.useRef<string | null>(null);
  const [openTaskHighlightId, setOpenTaskHighlightId] = React.useState<string | null>(null);
  const [confirmingShipmentId, setConfirmingShipmentId] = React.useState<string | null>(null);
  const [diffReasonDialogOpen, setDiffReasonDialogOpen] = React.useState(false);
  const [pendingDiffDoc, setPendingDiffDoc] = React.useState<ShipmentDoc | null>(null);
  const [pendingBulkDiffDocs, setPendingBulkDiffDocs] = React.useState<ShipmentDoc[]>([]);
  const [pendingBulkExactDocs, setPendingBulkExactDocs] = React.useState<ShipmentDoc[]>([]);
  const [selectedDiffReason, setSelectedDiffReason] = React.useState<string>("");
  const [selectedShipmentIds, setSelectedShipmentIds] = React.useState<string[]>([]);
  const [bulkConfirming, setBulkConfirming] = React.useState(false);
  const [bulkTakingToWork, setBulkTakingToWork] = React.useState(false);
  const [pickDraftByShipment, setPickDraftByShipment] = React.useState<Record<string, { locationId: string; qty: string }>>({});

  const movementDataSafe = React.useMemo(
    () => (Array.isArray(inventoryMovements) ? inventoryMovements : []),
    [inventoryMovements],
  );
  const locationsSafe = React.useMemo(() => (Array.isArray(locationsData) ? locationsData : []), [locationsData]);
  const locationById = React.useMemo(() => new Map(locationsSafe.map((l) => [l.id, l])), [locationsSafe]);
  const storageLocationIds = React.useMemo(
    () => new Set(locationsSafe.filter((l) => l?.type === "storage").map((l) => l.id)),
    [locationsSafe],
  );
  const receivingLocationIds = React.useMemo(() => {
    const ids = new Set(locationsSafe.filter((l) => l?.type === "receiving").map((l) => l.id));
    ids.add("loc-receiving");
    return ids;
  }, [locationsSafe]);

  const openTaskParam = searchParams.get("openTaskId") ?? searchParams.get("openTask");
  const reasonFromUrl = React.useMemo(() => {
    const raw = searchParams.get("reason");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [searchParams]);
  const problemFromUrl = React.useMemo(() => searchParams.get("problem"), [searchParams]);
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

  /** Список заданий после всех контекстных фильтров, но до быстрого фильтра (для счётчиков и второго шага). */
  const documentsBeforeQuickFilter = React.useMemo(() => {
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
      if (reasonFromUrl && reasonFromUrl.trim() !== "") {
        const want = reasonFromUrl.trim();
        if (String(d.differenceReason ?? "").trim() !== want) return false;
      }
      return true;
    });
    return problemFromUrl === "shortage"
      ? withFilters.filter((d) =>
          shippingStockShortageLinesForDoc(
            d,
            movementDataSafe,
            locationById,
            storageLocationIds,
            receivingLocationIds,
            data,
            catalog ?? [],
          ).length > 0,
        )
      : withFilters;
  }, [
    filtered,
    search,
    entities,
    viewMode,
    statusFilter,
    warehouseFilter,
    dateFrom,
    dateTo,
    reasonFromUrl,
    problemFromUrl,
    movementDataSafe,
    locationById,
    storageLocationIds,
    receivingLocationIds,
    data,
    catalog,
  ]);

  const shippingQuickFilterCounts = React.useMemo(() => {
    const base = Array.isArray(documentsBeforeQuickFilter) ? documentsBeforeQuickFilter : [];
    let problematic = 0;
    let shortage = 0;
    let shippedWithDiff = 0;
    let assembled = 0;
    for (const d of base) {
      const ui = shippingWorkflowFromGroup(d.shipments);
      const hasShortage = shippingStockShortageLinesForDoc(
        d,
        movementDataSafe,
        locationById,
        storageLocationIds,
        receivingLocationIds,
        data,
        catalog ?? [],
      ).length > 0;
      if (hasShortage || ui === "shipped_with_diff") problematic += 1;
      if (hasShortage) shortage += 1;
      if (ui === "shipped_with_diff") shippedWithDiff += 1;
      if (ui === "assembled") assembled += 1;
    }
    return {
      all: base.length,
      problematic,
      shortage,
      shipped_with_diff: shippedWithDiff,
      assembled,
    };
  }, [documentsBeforeQuickFilter, movementDataSafe, locationById, storageLocationIds, receivingLocationIds, data, catalog]);

  const documents = React.useMemo(() => {
    const afterProblem = Array.isArray(documentsBeforeQuickFilter) ? documentsBeforeQuickFilter : [];
    const afterQuick =
      shippingQuickFilter === "all"
        ? afterProblem
        : afterProblem.filter((d) => {
            const ui = shippingWorkflowFromGroup(d.shipments);
            const hasShortage = shippingStockShortageLinesForDoc(
              d,
              movementDataSafe,
              locationById,
              storageLocationIds,
              receivingLocationIds,
              data,
              catalog ?? [],
            ).length > 0;
            if (shippingQuickFilter === "problematic") return hasShortage || ui === "shipped_with_diff";
            if (shippingQuickFilter === "shortage") return hasShortage;
            if (shippingQuickFilter === "shipped_with_diff") return ui === "shipped_with_diff";
            if (shippingQuickFilter === "assembled") return ui === "assembled";
            return true;
          });
    return [...afterQuick].sort((a, b) => {
      if (viewMode === "archive") {
        return outboundArchiveSortKey(b.shipments) - outboundArchiveSortKey(a.shipments);
      }
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
  }, [documentsBeforeQuickFilter, shippingQuickFilter, viewMode, movementDataSafe, locationById, storageLocationIds, receivingLocationIds, data, catalog]);

  const documentIdsOnPage = React.useMemo(() => documents.map((d) => d.id), [documents]);

  React.useEffect(() => {
    const allowed = new Set(documentIdsOnPage);
    setSelectedShipmentIds((prev) => (Array.isArray(prev) ? prev : []).filter((id) => allowed.has(id)));
  }, [documentIdsOnPage]);

  const openTaskResolvedId = React.useMemo(() => {
    if (!openTaskDecoded) return null;
    const list = Array.isArray(documents) ? documents : [];
    const trimmed = openTaskDecoded.trim();
    const byId = list.find((d) => d && d.id === openTaskDecoded);
    if (byId) return byId.id;
    const byAssignment = list.find((d) => d && String(d.assignmentNo ?? "").trim() === trimmed);
    return byAssignment?.id ?? null;
  }, [openTaskDecoded, documents]);

  React.useEffect(() => {
    if (isLoading || error) return;
    if (!openTaskDecoded) {
      urlOpenTaskApplied.current = null;
      return;
    }
    if (!openTaskResolvedId) return;
    const token = `${openTaskDecoded}\0${openTaskResolvedId}`;
    if (urlOpenTaskApplied.current === token) return;
    setSelectedId(openTaskResolvedId);
    urlOpenTaskApplied.current = token;
  }, [isLoading, error, openTaskDecoded, openTaskResolvedId, documents]);

  React.useEffect(() => {
    if (!openTaskParam) {
      openTaskScrollDone.current = null;
    }
  }, [openTaskParam]);

  React.useEffect(() => {
    openTaskScrollDone.current = null;
  }, [openTaskDecoded]);

  React.useEffect(() => {
    if (!openTaskParam) {
      setOpenTaskHighlightId(null);
    }
  }, [openTaskParam]);

  React.useEffect(() => {
    if (!openTaskHighlightId) return;
    const t = window.setTimeout(() => setOpenTaskHighlightId(null), 1800);
    return () => window.clearTimeout(t);
  }, [openTaskHighlightId]);

  /** После раскрытия состава: прокрутка к центру экрана и краткая подсветка (openTaskId / openTask). */
  React.useEffect(() => {
    if (!openTaskResolvedId || selectedId !== openTaskResolvedId) return;
    if (openTaskScrollDone.current === openTaskResolvedId) return;
    let cancelled = false;

    const tryScroll = (): boolean => {
      const el = openTaskRowRef.current;
      if (!el) return false;
      if (cancelled) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (cancelled) return false;
      openTaskScrollDone.current = openTaskResolvedId;
      setOpenTaskHighlightId(openTaskResolvedId);
      return true;
    };

    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = window.setTimeout(() => {
      if (cancelled) return;
      if (tryScroll()) return;
      t2 = window.setTimeout(() => {
        if (cancelled) return;
        if (openTaskScrollDone.current === openTaskResolvedId) return;
        tryScroll();
      }, 280);
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
    };
  }, [openTaskResolvedId, selectedId, documents.length]);

  /**
   * ⚠️ только при наличии строк, где: plan>0, fact<plan, plan>доступно, доступно=max(0, остаток−резерв).
   * Не опираемся на статус задания: только критерии по строке. Без движений WMS — пусто.
   */
  const shippingDocStockWarning = React.useMemo(() => {
    const map = new Map<string, { lines: ShippingStockWarnLine[] }>();
    for (const doc of documents) {
      map.set(doc.id, {
        lines: shippingStockShortageLinesForDoc(
          doc,
          movementDataSafe,
          locationById,
          storageLocationIds,
          receivingLocationIds,
          data,
          catalog ?? [],
        ),
      });
    }
    return map;
  }, [documents, movementDataSafe, locationById, storageLocationIds, receivingLocationIds, data, catalog]);

  const selectedDoc = documents.find((x) => x.id === selectedId) ?? null;

  const operationLogsList = React.useMemo(
    () => (Array.isArray(operationLogsRaw) ? operationLogsRaw : []),
    [operationLogsRaw],
  );

  const selectedShipmentTaskLogs = React.useMemo(() => {
    if (!selectedId || !selectedDoc) return [];
    return operationLogsList
      .filter((log) => operationLogBelongsToShipmentDoc(selectedDoc, log))
      .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  }, [selectedId, selectedDoc, operationLogsList]);

  /** Строки отгрузки из хранилища часто без import* — подставляем поля из каталога по productId (как в упаковщике). */
  const selectedShipmentItemRows = React.useMemo<TaskItemRow[]>(() => {
    const itemsSafe = Array.isArray(selectedDoc?.shipments) ? selectedDoc.shipments : [];
    if (!itemsSafe.length) return [];
    const catalogSafe = Array.isArray(catalog) ? catalog : [];
    const byProduct = new Map(catalogSafe.map((p) => [p.id, p]));
    const showStock = !isShippingTerminal(selectedDoc.workflowStatus);
    const movementsReady = movementDataSafe.length > 0;
    const reserveByKey = showStock && movementsReady ? reservedQtyByBalanceKey(data ?? [], catalogSafe) : null;
    return itemsSafe.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const name = (sh.importName || product?.name || "").trim() || "—";
      const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      const color = (sh.importColor || product?.color || "").trim() || "—";
      const size = (sh.importSize || product?.size || "").trim() || "—";
      const plan = Number(sh.plannedUnits) || 0;
      const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
      let shippingStock: TaskItemRow["shippingStock"] = undefined;
      let shippingLocations: TaskItemRow["shippingLocations"] = undefined;
      if (showStock && reserveByKey) {
        const key = balanceKeyFromOutboundShipment(sh, product);
        const reserveQty = reserveByKey.get(key) ?? 0;
        const locationsBreakdown = shipmentLineAvailableByLocations({
          movements: movementDataSafe,
          locationById,
          storageLocationIds,
          receivingLocationIds,
          balanceKey: key,
          warehouseName: sh.sourceWarehouse || "",
          reserveQty,
        });
        const available = locationsBreakdown.storageAvailableTotal;
        if (fact >= plan) {
          shippingStock = { state: "sufficient" };
        } else if (plan > available) {
          shippingStock = { state: "short", available, shortage: shippingShortage(plan, available) };
        } else {
          shippingStock = { state: "sufficient" };
        }
        shippingLocations = {
          storage: locationsBreakdown.storage,
          other: locationsBreakdown.other,
        };
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
        shippingLocations,
      };
    });
  }, [selectedDoc, catalog, movementDataSafe, data, locationById, storageLocationIds, receivingLocationIds]);

  const selectedShipmentPickRows = React.useMemo(() => {
    const itemsSafe = Array.isArray(selectedDoc?.shipments) ? selectedDoc.shipments : [];
    const catalogSafe = Array.isArray(catalog) ? catalog : [];
    const byProduct = new Map(catalogSafe.map((p) => [p.id, p]));
    const reserveByKey = reservedQtyByBalanceKey(data ?? [], catalogSafe);
    return itemsSafe.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const key = balanceKeyFromOutboundShipment(sh, product);
      const reserveQty = reserveByKey.get(key) ?? 0;
      const byLocations = shipmentLineAvailableByLocations({
        movements: movementDataSafe,
        locationById,
        storageLocationIds,
        receivingLocationIds,
        balanceKey: key,
        warehouseName: sh.sourceWarehouse || "",
        reserveQty,
      });
      const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
      const plan = Number(sh.plannedUnits) || 0;
      const remaining = Math.max(0, plan - fact);
      const name = (sh.importName || product?.name || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      return {
        shipmentId: sh.id,
        name,
        barcode,
        plan,
        fact,
        remaining,
        legalEntityId: sh.legalEntityId,
        legalEntityName: (entities ?? []).find((e) => e.id === sh.legalEntityId)?.shortName ?? sh.legalEntityId,
        warehouseName: sh.sourceWarehouse || "—",
        marketplace: sh.marketplace,
        article: (sh.importArticle || product?.supplierArticle || "").trim() || "—",
        color: (sh.importColor || product?.color || "").trim() || "—",
        size: (sh.importSize || product?.size || "").trim() || "—",
        taskId: (sh.assignmentId || sh.id || "").trim() || sh.id,
        taskNumber: (sh.assignmentNo || sh.assignmentId || sh.id || "").trim() || sh.id,
        storageOptions: byLocations.storage,
        otherLocations: byLocations.other,
      };
    });
  }, [selectedDoc, catalog, data, movementDataSafe, locationById, storageLocationIds, receivingLocationIds, entities]);

  React.useEffect(() => {
    const lines = Array.isArray(selectedShipmentPickRows) ? selectedShipmentPickRows : [];
    setPickDraftByShipment((prev) => {
      const next: Record<string, { locationId: string; qty: string }> = {};
      for (const line of lines) {
        const prevDraft = prev[line.shipmentId];
        const opts = line.storageOptions ?? [];
        const stillValid =
          Boolean(prevDraft?.locationId) && opts.some((o) => o.locationId === prevDraft?.locationId);
        const locationId = stillValid
          ? prevDraft!.locationId
          : prevDraft?.locationId === ""
            ? ""
            : opts[0]?.locationId ?? "";
        next[line.shipmentId] = {
          locationId,
          qty: prevDraft?.qty ?? "",
        };
      }
      return next;
    });
  }, [selectedShipmentPickRows]);

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
        setPendingBulkDiffDocs([]);
        setPendingBulkExactDocs([]);
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
    if (!selectedDiffReason) return;

    const bulkDiff = Array.isArray(pendingBulkDiffDocs) ? pendingBulkDiffDocs : [];
    const bulkExact = Array.isArray(pendingBulkExactDocs) ? pendingBulkExactDocs : [];

    if (bulkDiff.length > 0) {
      if (bulkConfirming || bulkTakingToWork) return;
      setBulkConfirming(true);
      const ts = new Date().toISOString();
      try {
        for (const doc of bulkDiff) {
          for (const sh of doc.shipments) {
            const patch: Partial<OutboundShipment> & { differenceReason?: string } = {
              workflowStatus: "shipped_with_diff" as TaskWorkflowStatus,
              completedAt: sh.completedAt ?? ts,
              updatedAt: ts,
              differenceReason: selectedDiffReason,
            };
            await updateOutboundDraft({ id: sh.id, patch });
          }
        }
        for (const doc of bulkExact) {
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
        }
        const n = bulkDiff.length + bulkExact.length;
        setDiffReasonDialogOpen(false);
        setPendingBulkDiffDocs([]);
        setPendingBulkExactDocs([]);
        setSelectedDiffReason("");
        setSelectedShipmentIds([]);
        toast.success("Отгрузки подтверждены", { description: `Обработано заданий: ${n}.` });
      } finally {
        setBulkConfirming(false);
      }
      return;
    }

    if (!pendingDiffDoc || pendingDiffDoc.workflowStatus !== "assembled") return;
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
  }, [
    pendingDiffDoc,
    pendingBulkDiffDocs,
    pendingBulkExactDocs,
    selectedDiffReason,
    confirmingShipmentId,
    bulkConfirming,
    bulkTakingToWork,
    updateOutboundDraft,
  ]);

  const confirmBulkSelectedShipments = React.useCallback(async () => {
    const ids = new Set(Array.isArray(selectedShipmentIds) ? selectedShipmentIds : []);
    const list = Array.isArray(documents) ? documents : [];
    const selected = list.filter((d) => d && ids.has(d.id));
    const nonAssembled = selected.filter((d) => d.workflowStatus !== "assembled");
    const assembled = selected.filter((d) => d.workflowStatus === "assembled");
    if (nonAssembled.length > 0) {
      toast.warning("Подтвердить можно только отгрузки со статусом 'Собрано'.");
    }
    if (assembled.length === 0) return;
    if (bulkConfirming || bulkTakingToWork) return;
    const withDiff = assembled.filter((d) => d.fact < d.planned);
    const withoutDiff = assembled.filter((d) => d.fact >= d.planned);
    if (withDiff.length > 0) {
      setPendingDiffDoc(null);
      setPendingBulkDiffDocs(withDiff);
      setPendingBulkExactDocs(withoutDiff);
      setSelectedDiffReason("");
      setDiffReasonDialogOpen(true);
      return;
    }
    if (bulkTakingToWork) return;
    setBulkConfirming(true);
    const ts = new Date().toISOString();
    try {
      for (const doc of withoutDiff) {
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
      }
      setSelectedShipmentIds([]);
      toast.success("Отгрузки подтверждены", { description: `Подтверждено заданий: ${withoutDiff.length}.` });
    } finally {
      setBulkConfirming(false);
    }
  }, [selectedShipmentIds, documents, bulkConfirming, bulkTakingToWork, updateOutboundDraft]);

  const takeBulkSelectedToWork = React.useCallback(async () => {
    const ids = new Set(Array.isArray(selectedShipmentIds) ? selectedShipmentIds : []);
    const list = Array.isArray(documents) ? documents : [];
    const selected = list.filter((d) => d && ids.has(d.id));
    const pendingDocs = selected.filter((d) => d.workflowStatus === "pending");
    const nonPending = selected.filter((d) => d.workflowStatus !== "pending");
    if (nonPending.length > 0) {
      toast.warning("В работу можно взять только отгрузки со статусом 'Новое'.");
    }
    if (pendingDocs.length === 0) return;
    if (bulkTakingToWork || bulkConfirming) return;
    setBulkTakingToWork(true);
    try {
      for (const doc of pendingDocs) {
        for (const sh of doc.shipments) {
          await updateOutboundDraft({
            id: sh.id,
            patch: { workflowStatus: "processing", status: "к отгрузке" },
          });
        }
      }
      setSelectedShipmentIds([]);
      toast.success(`В работу передано: ${pendingDocs.length}`);
    } finally {
      setBulkTakingToWork(false);
    }
  }, [selectedShipmentIds, documents, bulkTakingToWork, bulkConfirming, updateOutboundDraft]);

  const submitPickFromCell = React.useCallback(
    async (shipmentId: string) => {
      const line = selectedShipmentPickRows.find((x) => x.shipmentId === shipmentId);
      if (!line) return;
      const draft = pickDraftByShipment[shipmentId];
      const locationId = (draft?.locationId || "").trim();
      if (!locationId) {
        toast.error("Выберите ячейку хранения");
        return;
      }
      const selectedCell = line.storageOptions.find((opt) => opt.locationId === locationId);
      if (!selectedCell) {
        toast.error("Выбранная ячейка недоступна для подбора");
        return;
      }
      const qty = Math.trunc(Number(draft?.qty) || 0);
      if (qty <= 0) {
        toast.error("Укажите корректное количество");
        return;
      }
      if (qty > selectedCell.available) {
        toast.error("Нельзя подобрать больше доступного в выбранной ячейке");
        return;
      }
      if (qty > line.remaining) {
        toast.error("Нельзя подобрать больше, чем осталось по заданию");
        return;
      }
      const ts = new Date().toISOString();
      const nextFact = line.fact + qty;
      const plan = line.plan;
      const lineDone = nextFact >= plan && plan > 0;
      try {
        await addInventoryMovements([
          {
            id: `pick-${shipmentId}-${Date.now()}`,
            type: "OUTBOUND",
            source: "shipping",
            taskId: line.taskId,
            taskNumber: line.taskNumber,
            legalEntityId: line.legalEntityId,
            legalEntityName: line.legalEntityName,
            warehouseName: line.warehouseName,
            locationId,
            itemId: shipmentId,
            name: line.name,
            article: line.article,
            sku: line.article,
            barcode: line.barcode,
            marketplace: line.marketplace,
            color: line.color,
            size: line.size,
            qty: -qty,
            createdAt: ts,
          },
        ]);
        await updateOutboundDraft({
          id: shipmentId,
          patch: {
            packedUnits: nextFact,
            shippedUnits: nextFact,
            updatedAt: ts,
            ...(lineDone ? { workflowStatus: "completed" as const } : {}),
          },
        });
        setPickDraftByShipment((prev) => ({
          ...prev,
          [shipmentId]: {
            locationId: "",
            qty: "",
          },
        }));
        toast.success("Подбор выполнен");
      } catch {
        toast.error("Не удалось выполнить подбор");
      }
    },
    [selectedShipmentPickRows, pickDraftByShipment, addInventoryMovements, updateOutboundDraft],
  );

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
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: "Все" },
                { id: "problematic" as const, label: "Проблемные" },
                { id: "shortage" as const, label: "Не хватает товара" },
                { id: "shipped_with_diff" as const, label: "С расхождением" },
                { id: "assembled" as const, label: "Готово к отгрузке" },
              ] as const
            ).map((opt) => {
              const active = shippingQuickFilter === opt.id;
              const cnt = shippingQuickFilterCounts[opt.id] ?? 0;
              return (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShippingQuickFilter(opt.id)}
                  className={cn(
                    "h-8 cursor-pointer gap-1.5 px-3 text-xs font-medium shadow-none",
                    active
                      ? "border-slate-800 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <span>{opt.label}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "text-slate-200" : "text-slate-500",
                    )}
                  >
                    {cnt}
                  </span>
                </Button>
              );
            })}
          </div>
          {selectedShipmentIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">Выбрано: {selectedShipmentIds.length}</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkTakingToWork || bulkConfirming || isUpdatingOutboundDraft}
                  onClick={() => void takeBulkSelectedToWork()}
                >
                  Взять в работу
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={bulkConfirming || bulkTakingToWork || isUpdatingOutboundDraft}
                  onClick={() => void confirmBulkSelectedShipments()}
                >
                  Подтвердить выбранные
                </Button>
              </div>
            </div>
          ) : null}
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
                <Table className="min-w-[1320px] table-auto">
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
                      <TableHead className="h-9 w-10 px-2 py-2">
                        <Checkbox
                          checked={
                            documentIdsOnPage.length > 0 &&
                            documentIdsOnPage.every((id) => selectedShipmentIds.includes(id))
                              ? true
                              : documentIdsOnPage.some((id) => selectedShipmentIds.includes(id))
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() => {
                            const allIds = documentIdsOnPage;
                            const allSelected =
                              allIds.length > 0 && allIds.every((id) => selectedShipmentIds.includes(id));
                            setSelectedShipmentIds((prev) => {
                              const cur = new Set(Array.isArray(prev) ? prev : []);
                              if (allSelected) {
                                allIds.forEach((id) => cur.delete(id));
                              } else {
                                allIds.forEach((id) => cur.add(id));
                              }
                              return [...cur];
                            });
                          }}
                          aria-label="Выбрать все на странице"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableHead>
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
                      const rowSelected = selectedShipmentIds.includes(doc.id);
                      return (
                        <React.Fragment key={doc.id}>
                          <TableRow
                            ref={openTaskResolvedId === doc.id ? openTaskRowRef : undefined}
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
                            <TableCell className="w-10 px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={rowSelected}
                                onCheckedChange={(v) => {
                                  const on = v === true;
                                  setSelectedShipmentIds((prev) => {
                                    const p = Array.isArray(prev) ? prev : [];
                                    if (on) return p.includes(doc.id) ? p : [...p, doc.id];
                                    return p.filter((id) => id !== doc.id);
                                  });
                                }}
                                aria-label={`Выбрать задание ${doc.assignmentNo}`}
                              />
                            </TableCell>
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
                              <TableCell colSpan={14} className="align-top p-0">
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
                                  <div className="rounded-md border border-slate-200 bg-white p-3">
                                    <p className="mb-2 text-xs font-medium text-slate-600">История задачи</p>
                                    {selectedShipmentTaskLogs.length === 0 ? (
                                      <p className="text-sm text-slate-600">История по задаче пока пустая</p>
                                    ) : (
                                      <div className="divide-y divide-slate-100">
                                        {selectedShipmentTaskLogs.map((log) => {
                                          const ts = Date.parse(log.createdAt);
                                          const when = Number.isFinite(ts)
                                            ? format(new Date(ts), "dd.MM.yyyy HH:mm", { locale: ru })
                                            : log.createdAt || "—";
                                          return (
                                            <div key={log.id} className="py-2.5 first:pt-0 last:pb-0">
                                              <p className="text-xs tabular-nums text-slate-500">{when}</p>
                                              <p className="mt-0.5 text-sm text-slate-900">
                                                {formatOperationLogDescription(log.description)}
                                              </p>
                                              <p className="mt-0.5 text-xs text-slate-600">
                                                {formatOperationLogShortStatus(log.type)}
                                              </p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
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
                                          disabled={
                                            confirmingShipmentId === doc.id ||
                                            isUpdatingOutboundDraft ||
                                            bulkConfirming ||
                                            bulkTakingToWork
                                          }
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
                                  {!isShippingTerminal(uiStatus) && selectedShipmentPickRows.length > 0 ? (
                                    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                                      <p className="text-xs font-medium text-slate-600">Подбор из ячейки хранения</p>
                                      <div className="space-y-2">
                                        {selectedShipmentPickRows.map((line) => {
                                          const draft = pickDraftByShipment[line.shipmentId] ?? { locationId: "", qty: "" };
                                          const selectedCell = line.storageOptions.find((opt) => opt.locationId === draft.locationId);
                                          const maxQty = Math.min(line.remaining, selectedCell?.available ?? 0);
                                          const pickingDone = line.remaining <= 0;
                                          const pickQtyParsed = Math.trunc(Number(draft.qty) || 0);
                                          const pickQtyOk =
                                            draft.qty.trim() !== "" && pickQtyParsed > 0 && pickQtyParsed <= maxQty;
                                          return (
                                            <div key={line.shipmentId} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-12 md:items-end">
                                              <div className="md:col-span-4">
                                                <div className="text-sm font-medium text-slate-900">{line.name}</div>
                                                <div className="text-xs text-slate-600">
                                                  {line.barcode} · Осталось: {line.remaining.toLocaleString("ru-RU")}
                                                </div>
                                                {pickingDone ? (
                                                  <div className="mt-1 text-xs font-medium text-emerald-700">Подбор выполнен</div>
                                                ) : null}
                                              </div>
                                              <div className="md:col-span-3">
                                                <div className="mb-1 text-[11px] text-slate-600">Ячейка</div>
                                                <Select
                                                  value={draft.locationId || undefined}
                                                  onValueChange={(value) =>
                                                    setPickDraftByShipment((prev) => ({
                                                      ...prev,
                                                      [line.shipmentId]: {
                                                        ...prev[line.shipmentId],
                                                        locationId: value,
                                                        qty: prev[line.shipmentId]?.qty ?? "",
                                                      },
                                                    }))
                                                  }
                                                  disabled={line.storageOptions.length === 0 || pickingDone}
                                                >
                                                  <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Выберите ячейку" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {line.storageOptions.map((opt) => (
                                                      <SelectItem key={opt.locationId} value={opt.locationId}>
                                                        {opt.label} — {opt.available.toLocaleString("ru-RU")} шт
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                              <div className="md:col-span-2">
                                                <div className="mb-1 text-[11px] text-slate-600">Количество</div>
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  max={maxQty > 0 ? maxQty : undefined}
                                                  value={draft.qty}
                                                  onChange={(e) =>
                                                    setPickDraftByShipment((prev) => ({
                                                      ...prev,
                                                      [line.shipmentId]: { ...prev[line.shipmentId], qty: e.target.value, locationId: prev[line.shipmentId]?.locationId ?? "" },
                                                    }))
                                                  }
                                                  disabled={line.storageOptions.length === 0 || pickingDone}
                                                  className="h-8"
                                                />
                                              </div>
                                              <div className="md:col-span-3">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  className="h-8 w-full"
                                                  onClick={() => void submitPickFromCell(line.shipmentId)}
                                                  disabled={
                                                    line.storageOptions.length === 0 ||
                                                    pickingDone ||
                                                    !draft.locationId ||
                                                    !pickQtyOk ||
                                                    isUpdatingOutboundDraft ||
                                                    isAppendingMovements
                                                  }
                                                >
                                                  Подобрать
                                                </Button>
                                                {line.storageOptions.length === 0 ? (
                                                  <div className="mt-1 text-[11px] text-slate-500">Нет доступных остатков в ячейках хранения</div>
                                                ) : null}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
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
            setPendingBulkDiffDocs([]);
            setPendingBulkExactDocs([]);
            setSelectedDiffReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Укажите причину расхождения</DialogTitle>
            <DialogDescription>
              {pendingBulkDiffDocs.length > 0
                ? `Факт меньше плана у ${pendingBulkDiffDocs.length} заданий. Причина будет применена ко всем таким отгрузкам. Перед подтверждением выберите причину.`
                : "Факт меньше плана. Перед подтверждением выберите причину."}
            </DialogDescription>
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
              disabled={
                !selectedDiffReason ||
                bulkConfirming ||
                bulkTakingToWork ||
                (pendingBulkDiffDocs.length > 0
                  ? false
                  : !pendingDiffDoc ||
                    pendingDiffDoc.workflowStatus !== "assembled" ||
                    confirmingShipmentId === pendingDiffDoc.id)
              }
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
