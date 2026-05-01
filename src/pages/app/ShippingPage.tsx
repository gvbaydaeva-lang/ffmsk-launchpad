import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useAppendOperationLog,
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
import { formatOperationLogDescription, formatOperationLogShortStatus } from "@/lib/operationLogDisplay";
import { getBalanceByKeyMap, movementLocationTotalsForWarehouseBalanceKey } from "@/services/mockInventoryMovements";
import { toast } from "sonner";
import {
  outboundPackedQtyAssemblyGate,
  outboundPickedQty,
  outboundShipmentsPackedQtyPlanSatisfied,
} from "@/lib/outboundPickPackQty";

type ShipmentDoc = {
  id: string;
  legalEntityId: string;
  assignmentNo: string;
  createdAt: string;
  completedAtIso?: string;
  sourceWarehouse: string;
  marketplace: Marketplace;
  planned: number;
  /** Подобрано (picked / legacy shipped без packedQty). */
  fact: number;
  /** Упаковано: packedQty с fallback (= fact). */
  packed: number;
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
  if (status === "shipped_with_diff") return "Отгружено с расхождением";
  if (status === "cancelled") return "Отгрузка отменена";
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

function isShipmentDocArchivedClosed(d: ShipmentDoc): boolean {
  return isShippingTerminal(d.workflowStatus as ShippingUiStatus) || d.workflowStatus === "cancelled";
}

/** Отмена доступна до финальной отгрузки: новое / в работе / в сборке / собрано. */
function canShowCancelShipmentButton(ui: ShippingUiStatus): boolean {
  if (ui === "shipped" || ui === "shipped_with_diff" || ui === "cancelled") return false;
  return ui === "pending" || ui === "processing" || ui === "assembling" || ui === "assembled";
}

/**
 * Строка «закрыта отгрузкой» для отмены подбора и т.п.: учитывает legacy status «отгружено».
 * Не использовать для блокировки диспетчерского «Подтвердить отгрузку»: после упаковщика возможно assembled + «отгружено».
 */
function isOutboundShipmentRowTerminalGate(sh: OutboundShipment | null | undefined): boolean {
  if (!sh) return false;
  const wf = String(sh.workflowStatus ?? "");
  return wf === "shipped" || wf === "shipped_with_diff" || String(sh.status ?? "").trim() === "отгружено";
}

/** Финал по workflow: только shipped / shipped_with_diff; при смеси статусов по строкам — задание не считается отгруженным. */
function isOutboundShipmentRowWorkflowShippedTerminal(sh: OutboundShipment | null | undefined): boolean {
  if (!sh) return false;
  const wf = String(sh.workflowStatus ?? "");
  return wf === "shipped" || wf === "shipped_with_diff";
}

function shipmentOutboundRowsAllShippedTerminal(doc: ShipmentDoc | null | undefined): boolean {
  const rows = Array.isArray(doc?.shipments) ? doc!.shipments! : [];
  if (rows.length === 0) return false;
  return rows.every((s) => isOutboundShipmentRowWorkflowShippedTerminal(s));
}

/** Нельзя снова подтверждать: документ уже в терминальном статусе или все строки отгружены. */
function isShipmentFinalizeBlockedAlreadyDone(doc: ShipmentDoc | null | undefined): boolean {
  if (!doc) return false;
  if (doc.workflowStatus === "cancelled") return true;
  if (isShippingTerminal(doc.workflowStatus as ShippingUiStatus)) return true;
  return shipmentOutboundRowsAllShippedTerminal(doc);
}

function shippingWorkflowFromGroup(shipments: OutboundShipment[]): ShippingUiStatus {
  const perRow = shipments.map((s): ShippingUiStatus => {
    const wf = (s.workflowStatus ?? "pending") as string;
    if (wf === "cancelled" || String(s.status ?? "").trim() === "отменено") return "cancelled";
    if (wf === "shipped_with_diff") return "shipped_with_diff";
    if (wf === "completed") return "assembled";
    if (wf === "processing" || wf === "assembling" || wf === "assembled" || wf === "shipped") return wf;
    if (s.status === "отгружено") return "shipped";
    return "pending";
  });
  if (perRow.some((x) => x === "cancelled")) return "cancelled";
  if (perRow.some((x) => x === "processing")) return "processing";
  if (perRow.some((x) => x === "assembling")) return "assembling";
  if (perRow.every((x) => x === "shipped_with_diff")) return "shipped_with_diff";
  if (perRow.every((x) => x === "shipped")) return "shipped";
  if (perRow.every((x) => x === "assembled")) return "assembled";
  return "pending";
}

/** Все строки с планом > 0: packedQty ?? 0 >= plan (см. outboundShipmentsPackedQtyPlanSatisfied). */
function shippingGroupAllLinesPacked(shipments: OutboundShipment[] | undefined | null): boolean {
  const rows = Array.isArray(shipments) ? shipments : [];
  return outboundShipmentsPackedQtyPlanSatisfied(rows);
}

/** Сумма явного упакованного (packedQty ?? 0) по строкам — для текстов статуса, согласованных с завершением сборки. */
function shippingOutboundPackedQtyGateSum(shipments: OutboundShipment[] | undefined | null): number {
  const rows = shipments ?? [];
  const safe = Array.isArray(rows) ? rows : [];
  return safe.reduce((s, sh) => s + outboundPackedQtyAssemblyGate(sh), 0);
}

function shipmentDocPackedTotal(doc: ShipmentDoc | null | undefined): number {
  return shippingOutboundPackedQtyGateSum(doc?.shipments ?? []);
}

/** Отгрузка без расхождений: все строки упакованы по плану и подобрано ≥ плана по документу. */
function canShipmentExactFinalize(doc: ShipmentDoc | null | undefined): boolean {
  if (!doc) return false;
  const rows = doc.shipments ?? [];
  const safe = Array.isArray(rows) ? rows : [];
  if (!safe.length) return false;
  if (!outboundShipmentsPackedQtyPlanSatisfied(safe)) return false;
  return Number(doc.fact ?? 0) >= Number(doc.planned ?? 0);
}

/** Конец со shipped_with_diff: есть упакованные единицы, но точное завершение недоступно. */
function canShipmentDiffFinalize(doc: ShipmentDoc | null | undefined): boolean {
  if (!doc) return false;
  if (canShipmentExactFinalize(doc)) return false;
  return shipmentDocPackedTotal(doc) > 0;
}

/** ISO момента отгрузки: max shippedAt, если все строки в финале (shipped / shipped_with_diff). */
function outboundShipmentsShippedAtIso(shipments: OutboundShipment[] | undefined | null): string | undefined {
  const rows = Array.isArray(shipments) ? shipments : [];
  if (rows.length === 0) return undefined;
  if (!rows.every((s) => s.workflowStatus === "shipped" || s.workflowStatus === "shipped_with_diff")) return undefined;
  let max = "";
  for (const sh of rows) {
    const raw = (sh.shippedAt ?? "").trim();
    if (raw && raw > max) max = raw;
  }
  return max || undefined;
}

/** Запись журнала: подбор или отмена из ячейки (безопасные подписи по ТЗ). */
function buildShippingCellPickLogDescription(
  title: string,
  itemName: string | undefined,
  quantity: number | undefined,
  locationLabel: string | undefined,
  shipmentNumber: string | undefined,
): string {
  const n = (itemName ?? "").trim() || "Товар";
  const q = Math.max(0, Math.trunc(Number(quantity ?? 0) || 0));
  const loc = (locationLabel ?? "").trim() || "Без места";
  const num = (shipmentNumber ?? "").trim() || "—";
  return `${title}. Товар: ${n}; количество: ${q}; ячейка: ${loc}; № отгрузки: ${num}`;
}

function shippingGroupFullyPickedForPlan(shipments: OutboundShipment[] | undefined | null): boolean {
  const rows = Array.isArray(shipments) ? shipments : [];
  if (rows.length === 0) return false;
  return rows.every((sh) => {
    const plan = Number(sh.plannedUnits ?? 0) || 0;
    if (plan <= 0) return true;
    const factRaw = Number(outboundPickedQty(sh) ?? 0);
    const factQty = Number.isFinite(factRaw) ? Math.max(0, Math.trunc(factRaw)) : 0;
    return factQty >= plan;
  });
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
  const byLoc = movementLocationTotalsForWarehouseBalanceKey(movementsSafe, wh, params.balanceKey);
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
    const picked = outboundPickedQty(sh);
    if (picked >= plan) continue;
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
    () => [
      "товара не хватило",
      "повреждение товара",
      "ошибка подбора",
      "отменено клиентом",
      "другое",
    ],
    [],
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error, updateOutboundDraft, isUpdatingOutboundDraft } = useOutboundShipments();
  const { data: inventoryMovements = [], addInventoryMovements, isAppending: isAppendingMovements } = useInventoryMovements();
  const { data: locationsData } = useLocations();
  const { data: catalog } = useProductCatalog();
  const { data: entities } = useLegalEntities();
  const { data: operationLogsRaw } = useOperationLogs();
  const appendOperationLog = useAppendOperationLog();
  const { legalEntityId } = useAppFilters();
  useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus | "shipped_with_diff">("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  type ShippingQuickFilter = "all" | "problematic" | "shortage" | "shipped_with_diff" | "assembled" | "shipped";
  const [shippingQuickFilter, setShippingQuickFilter] = React.useState<ShippingQuickFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const openTaskRowRef = React.useRef<HTMLTableRowElement | null>(null);
  const urlOpenTaskApplied = React.useRef<string | null>(null);
  const openTaskScrollDone = React.useRef<string | null>(null);
  const [openTaskHighlightId, setOpenTaskHighlightId] = React.useState<string | null>(null);
  const [confirmingShipmentId, setConfirmingShipmentId] = React.useState<string | null>(null);
  /** Синхронная защита от двойного клика до срабатывания `setConfirmingShipmentId`. */
  const finalizeInFlightIdsRef = React.useRef<Set<string>>(new Set());
  const diffBulkSubmitInFlightRef = React.useRef(false);
  const bulkExactBulkInFlightRef = React.useRef(false);
  const cancelShipmentInFlightRef = React.useRef<Set<string>>(new Set());
  const [cancellingShipmentId, setCancellingShipmentId] = React.useState<string | null>(null);
  const [diffReasonDialogOpen, setDiffReasonDialogOpen] = React.useState(false);
  const [pendingDiffDoc, setPendingDiffDoc] = React.useState<ShipmentDoc | null>(null);
  const [pendingBulkDiffDocs, setPendingBulkDiffDocs] = React.useState<ShipmentDoc[]>([]);
  const [pendingBulkExactDocs, setPendingBulkExactDocs] = React.useState<ShipmentDoc[]>([]);
  const [selectedDiffReason, setSelectedDiffReason] = React.useState<string>("");
  const [selectedShipmentIds, setSelectedShipmentIds] = React.useState<string[]>([]);
  const [bulkConfirming, setBulkConfirming] = React.useState(false);
  const [bulkTakingToWork, setBulkTakingToWork] = React.useState(false);
  const [assemblyCompletingId, setAssemblyCompletingId] = React.useState<string | null>(null);
  const [pickDraftByShipment, setPickDraftByShipment] = React.useState<Record<string, { locationId: string; qty: string }>>({});
  const [undoingPickId, setUndoingPickId] = React.useState<string | null>(null);

  const movementDataSafe = React.useMemo(() => {
    const m = inventoryMovements ?? [];
    return Array.isArray(m) ? m : [];
  }, [inventoryMovements]);
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
      const rows = Array.isArray(shipments) ? shipments : [];
      const first = rows[0];
      if (!first) continue;
      const createdAt = rows.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), first.createdAt);
      const planned = rows.reduce((s, sh) => s + (Number(sh.plannedUnits ?? 0) || 0), 0);
      const fact = rows.reduce((s, sh) => s + Number(outboundPickedQty(sh) ?? 0), 0);
      const packed = rows.reduce((s, sh) => s + outboundPackedQtyAssemblyGate(sh), 0);
      const workflowStatus = shippingWorkflowFromGroup(rows);
      const priority = mergePriorityFromShipments(rows);
      const groupId = `${first.legalEntityId}::${first.assignmentId ?? first.assignmentNo ?? first.id}`;
      docs.push({
        id: groupId,
        legalEntityId: first.legalEntityId,
        assignmentNo: first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id,
        createdAt,
        completedAtIso: outboundShipmentsCompletedAtIso(rows),
        sourceWarehouse: first.sourceWarehouse,
        marketplace: first.marketplace,
        planned,
        fact,
        packed,
        differenceReason:
          rows
            .map((s) => ((s as OutboundShipment & { differenceReason?: string }).differenceReason ?? "").trim())
            .find(Boolean) || undefined,
        shipments: rows,
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
      if (viewMode === "active" && isShipmentDocArchivedClosed(d)) return false;
      if (viewMode === "archive" && !isShipmentDocArchivedClosed(d)) return false;
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
    let shipped = 0;
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
      if (ui === "shipped") shipped += 1;
    }
    return {
      all: base.length,
      problematic,
      shortage,
      shipped_with_diff: shippedWithDiff,
      assembled,
      shipped,
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
            if (shippingQuickFilter === "shipped") return ui === "shipped";
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
  /** Массовые действия недоступны для уже отгруженных заданий. */
  const documentBulkSelectableIdsOnPage = React.useMemo(
    () => documents.filter((d) => !isShipmentFinalizeBlockedAlreadyDone(d)).map((d) => d.id),
    [documents],
  );

  React.useEffect(() => {
    const allowed = new Set(documentIdsOnPage);
    const bulkAllowed = new Set(documentBulkSelectableIdsOnPage);
    setSelectedShipmentIds((prev) => (Array.isArray(prev) ? prev : []).filter((id) => allowed.has(id) && bulkAllowed.has(id)));
  }, [documentIdsOnPage, documentBulkSelectableIdsOnPage]);

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

  const appendShipmentConfirmedLog = React.useCallback(
    (doc: ShipmentDoc) => {
      const logsRaw = queryClient.getQueryData<OperationLog[]>(["wms", "operation-logs"]);
      const logs = Array.isArray(logsRaw) ? logsRaw : [];
      const hasDup = logs.some(
        (log) =>
          operationLogBelongsToShipmentDoc(doc, log) && String(log.description ?? "").trim() === "Отгрузка подтверждена",
      );
      if (hasDup) return;

      const leName = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
      appendOperationLog({
        type: "SHIPMENT_CONFIRMED",
        legalEntityId: doc.legalEntityId,
        legalEntityName: leName,
        taskId: doc.id,
        taskNumber: doc.assignmentNo,
        description: "Отгрузка подтверждена",
      });
    },
    [appendOperationLog, entities, queryClient],
  );

  const appendShipmentDiffFinishedLog = React.useCallback(
    (doc: ShipmentDoc, reason: string) => {
      const no = ((doc?.assignmentNo ?? "") as string).trim() || "—";
      const rs = ((reason ?? "") as string).trim() || "—";
      const desc = `Отгрузка завершена с расхождением. № отгрузки: ${no}. Причина: ${rs}.`;
      const logsRaw = queryClient.getQueryData<OperationLog[]>(["wms", "operation-logs"]);
      const logs = Array.isArray(logsRaw) ? logsRaw : [];
      const dup = logs.some(
        (log) => operationLogBelongsToShipmentDoc(doc, log) && String(log.description ?? "").trim() === desc,
      );
      if (dup) return;

      const leName = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
      appendOperationLog({
        type: "SHIPMENT_DIFF_COMPLETED",
        legalEntityId: doc.legalEntityId,
        legalEntityName: leName,
        taskId: doc.id,
        taskNumber: (doc?.assignmentNo ?? "").trim() || "—",
        description: desc,
      });
    },
    [appendOperationLog, entities, queryClient],
  );

  const appendShipmentCancelledLog = React.useCallback(
    (doc: ShipmentDoc) => {
      const no = ((doc?.assignmentNo ?? "") as string).trim() || "—";
      const desc = `Отгрузка отменена. № отгрузки: ${no}.`;
      const logsRaw = queryClient.getQueryData<OperationLog[]>(["wms", "operation-logs"]);
      const logs = Array.isArray(logsRaw) ? logsRaw : [];
      const dup = logs.some(
        (log) => operationLogBelongsToShipmentDoc(doc, log) && String(log.description ?? "").trim() === desc,
      );
      if (dup) return;

      const leName = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
      appendOperationLog({
        type: "SHIPMENT_CANCELLED",
        legalEntityId: doc.legalEntityId,
        legalEntityName: leName,
        taskId: doc.id,
        taskNumber: (doc?.assignmentNo ?? "").trim() || "—",
        description: desc,
      });
    },
    [appendOperationLog, entities, queryClient],
  );

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
    const itemsRaw = selectedDoc?.shipments ?? [];
    const itemsSafe = Array.isArray(itemsRaw) ? itemsRaw : [];
    if (!itemsSafe.length) return [];
    const catalogSafe = Array.isArray(catalog) ? catalog : [];
    const byProduct = new Map(catalogSafe.map((p) => [p.id, p]));
    const grpStatus = selectedDoc?.workflowStatus;
    const showStock =
      grpStatus === undefined ||
      grpStatus === null ||
      (!isShippingTerminal(grpStatus as ShippingUiStatus) && grpStatus !== "cancelled");
    const movementsReady = movementDataSafe.length > 0;
    const reserveByKey = showStock && movementsReady ? reservedQtyByBalanceKey(data ?? [], catalogSafe) : null;
    return itemsSafe.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const name = (sh.importName || product?.name || "").trim() || "—";
      const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      const color = (sh.importColor || product?.color || "").trim() || "—";
      const size = (sh.importSize || product?.size || "").trim() || "—";
      const plan = Number(sh.plannedUnits ?? 0) || 0;
      const fact = Number(outboundPickedQty(sh) ?? 0) || 0;
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
        marketplace: String(sh.marketplace ?? "").trim().toUpperCase() || "—",
        color,
        size,
        plan,
        fact,
        shippingPackedQty: outboundPackedQtyAssemblyGate(sh),
        warehouse: sh.sourceWarehouse || "—",
        status: (sh.workflowStatus ?? "pending") as TaskItemRow["status"],
        shippingStock,
        shippingLocations,
      };
    });
  }, [selectedDoc, catalog, movementDataSafe, data, locationById, storageLocationIds, receivingLocationIds]);

  const selectedShipmentPickRows = React.useMemo(() => {
    const pickItemsRaw = selectedDoc?.shipments ?? [];
    const itemsSafe = Array.isArray(pickItemsRaw) ? pickItemsRaw : [];
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
      const plan = Math.max(0, Math.trunc(Number(sh.plannedUnits ?? 0) || 0));
      const fact = Math.max(0, Math.trunc(Number(outboundPickedQty(sh) ?? 0) || 0));
      const packedQtyEffective = outboundPackedQtyAssemblyGate(sh);
      const remaining = Math.max(0, plan - fact);
      const name = (sh.importName || product?.name || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      return {
        shipmentId: sh.id,
        name,
        barcode,
        plan,
        fact,
        packedQtyEffective,
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

  const completeShipmentAssembly = React.useCallback(
    async (doc: ShipmentDoc) => {
      if (isShipmentFinalizeBlockedAlreadyDone(doc)) {
        toast.info("Отгрузка уже завершена");
        return;
      }
      const rows = doc?.shipments ?? [];
      if (!Array.isArray(rows) || !shippingGroupAllLinesPacked(rows)) return;
      if (assemblyCompletingId === doc.id) return;
      if (isUpdatingOutboundDraft) return;
      setAssemblyCompletingId(doc.id);
      const ts = new Date().toISOString();
      try {
        for (const sh of rows) {
          await updateOutboundDraft({
            id: sh.id,
            patch: {
              workflowStatus: "assembled",
              updatedAt: ts,
            },
          });
        }
        toast.success("Сборка завершена", { description: "Статус задания переведён в «Собрано»." });
      } catch {
        toast.error("Не удалось завершить сборку");
      } finally {
        setAssemblyCompletingId(null);
      }
    },
    [updateOutboundDraft, assemblyCompletingId, isUpdatingOutboundDraft],
  );

  const cancelShipmentGroup = React.useCallback(
    async (doc: ShipmentDoc) => {
      if (doc.workflowStatus === "cancelled") {
        toast.info("Отгрузка уже отменена");
        return;
      }
      const ui = shippingWorkflowFromGroup(doc.shipments ?? []);
      if (isShippingTerminal(ui)) {
        toast.info("Нельзя отменить уже отгруженное задание");
        return;
      }
      if (!canShowCancelShipmentButton(ui)) return;
      if (cancelShipmentInFlightRef.current.has(doc.id)) return;

      const rows = Array.isArray(doc.shipments) ? doc.shipments : [];
      if (rows.length === 0) return;

      const okConfirm =
        typeof globalThis.confirm === "function"
          ? globalThis.confirm("Отменить отгрузку? Все подобранные товары будут возвращены в ячейки")
          : true;
      if (!okConfirm) return;

      const snapshot = Array.isArray(data) ? data : [];
      const safeMoves = Array.isArray(inventoryMovements) ? inventoryMovements : [];

      for (const sh of rows) {
        const latest = snapshot.find((x) => x.id === sh.id) ?? sh;
        if (String(latest.workflowStatus ?? "") === "cancelled" || String(latest.status ?? "").trim() === "отменено") {
          toast.info("Отгрузка уже отменена");
          return;
        }
        const fact = Math.max(0, Math.trunc(Number(outboundPickedQty(latest) ?? 0)));
        if (fact <= 0) continue;
        const pickMoves = safeMoves.filter(
          (m) =>
            m.type === "OUTBOUND" &&
            m.source === "shipping" &&
            (m.itemId ?? "").trim() === latest.id,
        );
        if (pickMoves.length === 0) {
          toast.error("Не найдены движения подбора для возврата в ячейки");
          return;
        }
        let sumPickQty = 0;
        for (const m of pickMoves) {
          const q = Number(m.qty);
          sumPickQty += Number.isFinite(q) ? q : 0;
        }
        const totalOutAbs = Math.abs(Math.trunc(Number(sumPickQty) || 0));
        if (totalOutAbs !== fact) {
          toast.error("Объём подбора не совпадает с движениями; отмена отгрузки невозможна");
          return;
        }
        if (pickMoves.some((m) => !(m.locationId ?? "").trim())) {
          toast.error("У движения подбора не указана ячейка возврата");
          return;
        }
      }

      cancelShipmentInFlightRef.current.add(doc.id);
      setCancellingShipmentId(doc.id);
      const ts = new Date().toISOString();
      let moveSeq = 0;
      try {
        const allInMoves: InventoryMovement[] = [];
        for (const sh of rows) {
          const latest = snapshot.find((x) => x.id === sh.id) ?? sh;
          const fact = Math.max(0, Math.trunc(Number(outboundPickedQty(latest) ?? 0)));
          if (fact <= 0) continue;
          const pickMoves = safeMoves.filter(
            (m) =>
              m.type === "OUTBOUND" &&
              m.source === "shipping" &&
              (m.itemId ?? "").trim() === latest.id,
          );
          for (let idx = 0; idx < pickMoves.length; idx += 1) {
            const m = pickMoves[idx];
            const absQty = Math.trunc(Math.abs(Number.isFinite(Number(m.qty)) ? Number(m.qty) : 0));
            if (absQty <= 0) continue;
            allInMoves.push({
              id: `cancel-ship-${latest.id}-${ts}-${moveSeq++}`,
              type: "INBOUND",
              source: "shipping",
              taskId: m.taskId,
              taskNumber: m.taskNumber,
              legalEntityId: m.legalEntityId,
              legalEntityName: m.legalEntityName,
              warehouseName: m.warehouseName,
              locationId: (m.locationId ?? "").trim(),
              itemId: m.itemId,
              name: m.name,
              article: m.article ?? m.sku ?? "",
              sku: m.sku ?? m.article ?? "",
              barcode: m.barcode ?? "",
              marketplace: m.marketplace,
              color: m.color ?? "—",
              size: m.size ?? "—",
              qty: absQty,
              createdAt: ts,
            });
          }
        }
        if (allInMoves.length > 0) {
          await addInventoryMovements(allInMoves);
        }
        for (const sh of rows) {
          await updateOutboundDraft({
            id: sh.id,
            patch: {
              workflowStatus: "cancelled",
              status: "отменено",
              pickedUnits: 0,
              shippedUnits: 0,
              packedQty: 0,
              packedUnits: 0,
              updatedAt: ts,
            },
          });
        }
        appendShipmentCancelledLog(doc);
        toast.success("Отгрузка отменена");
      } catch {
        toast.error("Не удалось отменить отгрузку");
      } finally {
        cancelShipmentInFlightRef.current.delete(doc.id);
        setCancellingShipmentId(null);
      }
    },
    [data, inventoryMovements, addInventoryMovements, updateOutboundDraft, appendShipmentCancelledLog],
  );

  const openShipmentDiffFinalizeDialog = React.useCallback((doc: ShipmentDoc | null | undefined) => {
    if (!doc) return;
    if (doc.workflowStatus === "cancelled") {
      toast.info("Отгрузка отменена");
      return;
    }
    if (!canShipmentDiffFinalize(doc)) {
      toast.error(
        shipmentDocPackedTotal(doc) <= 0
          ? "Нельзя отгрузить: ничего не упаковано"
          : "Нельзя завершить отгрузку с расхождением для этого задания.",
      );
      return;
    }
    if (isShipmentFinalizeBlockedAlreadyDone(doc)) {
      toast.info("Отгрузка уже завершена");
      return;
    }
    setPendingBulkDiffDocs([]);
    setPendingBulkExactDocs([]);
    setPendingDiffDoc(doc);
    setSelectedDiffReason("");
    setDiffReasonDialogOpen(true);
  }, []);

  const finalizeShipmentExact = React.useCallback(
    async (doc: ShipmentDoc) => {
      if (doc.workflowStatus === "cancelled") {
        toast.info("Отгрузка отменена");
        return;
      }
      if (isShipmentFinalizeBlockedAlreadyDone(doc)) {
        toast.info("Отгрузка уже завершена");
        return;
      }
      if (doc.workflowStatus !== "assembled") return;
      if (!canShipmentExactFinalize(doc)) return;
      const packRowsRaw = doc?.shipments ?? [];
      const packRows = Array.isArray(packRowsRaw) ? packRowsRaw : [];
      if (packRows.length === 0) return;
      if (finalizeInFlightIdsRef.current.has(doc.id)) return;
      finalizeInFlightIdsRef.current.add(doc.id);
      setConfirmingShipmentId(doc.id);
      const ts = new Date().toISOString();
      try {
        for (const sh of packRows) {
          await updateOutboundDraft({
            id: sh.id,
            patch: {
              workflowStatus: "shipped",
              status: "отгружено",
              shippedAt: ts,
              completedAt: sh.completedAt ?? ts,
              updatedAt: ts,
            },
          });
        }
        toast.success("Отгрузка подтверждена");
        appendShipmentConfirmedLog(doc);
      } finally {
        finalizeInFlightIdsRef.current.delete(doc.id);
        setConfirmingShipmentId(null);
      }
    },
    [updateOutboundDraft, appendShipmentConfirmedLog],
  );

  const submitDiffShipmentConfirm = React.useCallback(async () => {
    if (!selectedDiffReason) return;
    const okPrompt =
      typeof globalThis.confirm === "function"
        ? globalThis.confirm(
            "Завершить отгрузку с расхождением? Статус заданий будет переведён в «Отгружено с расхождением».",
          )
        : true;
    if (!okPrompt) return;

    const bulkDiff = Array.isArray(pendingBulkDiffDocs) ? pendingBulkDiffDocs : [];
    const bulkExact = Array.isArray(pendingBulkExactDocs) ? pendingBulkExactDocs : [];

    if (bulkDiff.length > 0) {
      if (bulkTakingToWork || diffBulkSubmitInFlightRef.current || bulkConfirming) return;
      diffBulkSubmitInFlightRef.current = true;
      setBulkConfirming(true);
      try {
        const bulkDiffReady = bulkDiff.filter((d) => !isShipmentFinalizeBlockedAlreadyDone(d));
        const bulkExactReady = bulkExact.filter((d) => !isShipmentFinalizeBlockedAlreadyDone(d));
        const skippedCount = bulkDiff.length + bulkExact.length - bulkDiffReady.length - bulkExactReady.length;
        if (bulkDiffReady.length === 0 && bulkExactReady.length === 0) {
          if (skippedCount > 1) {
            toast.info(`Все выбранные отгрузки уже завершены (${skippedCount}).`);
          } else {
            toast.info("Отгрузка уже завершена");
          }
          setDiffReasonDialogOpen(false);
          setPendingBulkDiffDocs([]);
          setPendingBulkExactDocs([]);
          setSelectedDiffReason("");
          return;
        }
        if (skippedCount > 0) {
          toast.info("Часть заданий уже завершена — пропущена.", { description: `Пропущено: ${skippedCount}.` });
        }
        for (const doc of bulkDiffReady) {
          if (shipmentDocPackedTotal(doc) <= 0) {
            toast.error("Нельзя завершить: по заданию ничего не упаковано.");
            return;
          }
          if (!canShipmentDiffFinalize(doc)) {
            toast.error("Нельзя завершить: задание больше не подходит под завершение с расхождением.");
            return;
          }
        }
        for (const doc of bulkExactReady) {
          if (!canShipmentExactFinalize(doc)) {
            toast.error("Нельзя завершить: часть заданий утратила условие обычного подтверждения.");
            return;
          }
        }
        const ts = new Date().toISOString();
        for (const doc of bulkDiffReady) {
          for (const sh of doc.shipments ?? []) {
            const patch: Partial<OutboundShipment> & { differenceReason?: string } = {
              workflowStatus: "shipped_with_diff" as TaskWorkflowStatus,
              status: "отгружено",
              shippedAt: ts,
              completedAt: sh.completedAt ?? ts,
              updatedAt: ts,
              differenceReason: selectedDiffReason,
            };
            await updateOutboundDraft({ id: sh.id, patch });
          }
        }
        for (const doc of bulkExactReady) {
          for (const sh of doc.shipments ?? []) {
            await updateOutboundDraft({
              id: sh.id,
              patch: {
                workflowStatus: "shipped",
                status: "отгружено",
                shippedAt: ts,
                completedAt: sh.completedAt ?? ts,
                updatedAt: ts,
              },
            });
          }
        }
        const n = bulkDiffReady.length + bulkExactReady.length;
        for (const doc of bulkDiffReady) {
          appendShipmentDiffFinishedLog(doc, selectedDiffReason);
        }
        for (const doc of bulkExactReady) {
          appendShipmentConfirmedLog(doc);
        }
        setDiffReasonDialogOpen(false);
        setPendingBulkDiffDocs([]);
        setPendingBulkExactDocs([]);
        setSelectedDiffReason("");
        setSelectedShipmentIds([]);
        toast.success("Отгрузки подтверждены", { description: `Обработано заданий: ${n}.` });
      } finally {
        setBulkConfirming(false);
        diffBulkSubmitInFlightRef.current = false;
      }
      return;
    }

    if (!pendingDiffDoc || !canShipmentDiffFinalize(pendingDiffDoc)) return;
    if (isShipmentFinalizeBlockedAlreadyDone(pendingDiffDoc)) {
      toast.info("Отгрузка уже завершена");
      setDiffReasonDialogOpen(false);
      setPendingDiffDoc(null);
      setSelectedDiffReason("");
      return;
    }
    if (finalizeInFlightIdsRef.current.has(pendingDiffDoc.id)) return;
    if (shipmentDocPackedTotal(pendingDiffDoc) <= 0) {
      toast.error("Нельзя отгрузить: ничего не упаковано");
      return;
    }
    const pendRowsRaw = pendingDiffDoc?.shipments ?? [];
    const pendRows = Array.isArray(pendRowsRaw) ? pendRowsRaw : [];
    finalizeInFlightIdsRef.current.add(pendingDiffDoc.id);
    setConfirmingShipmentId(pendingDiffDoc.id);
    const ts = new Date().toISOString();
    try {
      for (const sh of pendRows) {
        const patch: Partial<OutboundShipment> & { differenceReason?: string } = {
          workflowStatus: "shipped_with_diff" as TaskWorkflowStatus,
          status: "отгружено",
          shippedAt: ts,
          completedAt: sh.completedAt ?? ts,
          updatedAt: ts,
          differenceReason: selectedDiffReason,
        };
        await updateOutboundDraft({
          id: sh.id,
          patch,
        });
      }
      appendShipmentDiffFinishedLog(pendingDiffDoc, selectedDiffReason);
      setDiffReasonDialogOpen(false);
      setPendingDiffDoc(null);
      setSelectedDiffReason("");
      toast.success("Отгрузка завершена с расхождением");
    } finally {
      finalizeInFlightIdsRef.current.delete(pendingDiffDoc.id);
      setConfirmingShipmentId(null);
    }
  }, [
    pendingDiffDoc,
    pendingBulkDiffDocs,
    pendingBulkExactDocs,
    selectedDiffReason,
    bulkConfirming,
    bulkTakingToWork,
    updateOutboundDraft,
    appendShipmentConfirmedLog,
    appendShipmentDiffFinishedLog,
  ]);

  const confirmBulkSelectedShipments = React.useCallback(async () => {
    if (bulkConfirming || bulkTakingToWork || bulkExactBulkInFlightRef.current) return;
    const ids = new Set(Array.isArray(selectedShipmentIds) ? selectedShipmentIds : []);
    const list = Array.isArray(documents) ? documents : [];
    const selected = list.filter((d) => d && ids.has(d.id));
    const actionableSelected = selected.filter((d) => !isShipmentFinalizeBlockedAlreadyDone(d));
    const terminalSkippedFromSelection = selected.length - actionableSelected.length;
    if (actionableSelected.length === 0) {
      if (terminalSkippedFromSelection > 0) {
        toast.info("Отгрузка уже завершена");
      }
      return;
    }
    if (terminalSkippedFromSelection > 0) {
      toast.info("Часть заданий уже завершена — пропущена.", {
        description: `Пропущено: ${terminalSkippedFromSelection}.`,
      });
    }
    const exactEligible = actionableSelected.filter((d) => canShipmentExactFinalize(d));
    const diffEligible = actionableSelected.filter((d) => canShipmentDiffFinalize(d));
    const stalled = actionableSelected.filter((d) => !canShipmentExactFinalize(d) && !canShipmentDiffFinalize(d));
    if (stalled.length > 0) {
      toast.warning("Часть заданий исключена: нечего отгружать (ничего не упаковано или нет условий для подтверждения).");
    }
    if (exactEligible.length === 0 && diffEligible.length === 0) return;
    if (diffEligible.length > 0) {
      setPendingDiffDoc(null);
      setPendingBulkDiffDocs(diffEligible);
      setPendingBulkExactDocs(exactEligible);
      setSelectedDiffReason("");
      setDiffReasonDialogOpen(true);
      return;
    }
    bulkExactBulkInFlightRef.current = true;
    try {
      setBulkConfirming(true);
      const ts = new Date().toISOString();
      let confirmedExactCount = 0;
      try {
        for (const doc of exactEligible) {
          if (isShipmentFinalizeBlockedAlreadyDone(doc)) continue;
          for (const sh of doc.shipments ?? []) {
            await updateOutboundDraft({
              id: sh.id,
              patch: {
                workflowStatus: "shipped",
                status: "отгружено",
                shippedAt: ts,
                completedAt: sh.completedAt ?? ts,
                updatedAt: ts,
              },
            });
          }
          appendShipmentConfirmedLog(doc);
          confirmedExactCount += 1;
        }
        setSelectedShipmentIds([]);
        toast.success("Отгрузки подтверждены", {
          description: `Подтверждено заданий: ${confirmedExactCount}.`,
        });
      } finally {
        setBulkConfirming(false);
      }
    } finally {
      bulkExactBulkInFlightRef.current = false;
    }
  }, [
    selectedShipmentIds,
    documents,
    bulkConfirming,
    bulkTakingToWork,
    updateOutboundDraft,
    appendShipmentConfirmedLog,
  ]);

  const takeBulkSelectedToWork = React.useCallback(async () => {
    const ids = new Set(Array.isArray(selectedShipmentIds) ? selectedShipmentIds : []);
    const list = Array.isArray(documents) ? documents : [];
    const selected = list.filter((d) => d && ids.has(d.id));
    const actionable = selected.filter((d) => !isShipmentFinalizeBlockedAlreadyDone(d));
    const pendingDocs = actionable.filter((d) => d.workflowStatus === "pending");
    const nonPending = actionable.filter((d) => d.workflowStatus !== "pending");
    if (nonPending.length > 0) {
      toast.warning("В работу можно взять только отгрузки со статусом 'Новое'.");
    }
    if (selected.length > 0 && actionable.length === 0) {
      toast.info("Отгрузка уже завершена");
      return;
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
      if (!selectedDoc || isShipmentFinalizeBlockedAlreadyDone(selectedDoc)) {
        if (selectedDoc && isShipmentFinalizeBlockedAlreadyDone(selectedDoc)) {
          const wfPick = shippingWorkflowFromGroup(selectedDoc.shipments ?? []);
          toast.info(wfPick === "cancelled" ? "Отгрузка отменена" : "Отгрузка уже завершена");
        }
        return;
      }
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
      if (qty > (selectedCell.available ?? 0)) {
        toast.error("Нельзя подобрать больше доступного в выбранной ячейке");
        return;
      }
      const remPick = Math.max(0, Math.trunc(Number(line.remaining ?? 0) || 0));
      if (qty > remPick) {
        toast.error("Нельзя подобрать больше, чем осталось по заданию");
        return;
      }
      const ts = new Date().toISOString();
      const baseFact = Math.max(0, Math.trunc(Number(line.fact ?? 0) || 0));
      const nextFact = baseFact + qty;
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
            pickedUnits: nextFact,
            shippedUnits: nextFact,
            updatedAt: ts,
          },
        });
        setPickDraftByShipment((prev) => ({
          ...prev,
          [shipmentId]: {
            locationId: "",
            qty: "",
          },
        }));
        const fromCellLbl = (selectedCell?.label ?? "").trim();
        const fromLocName = (locationById.get(locationId)?.name ?? "").trim();
        const cellLabel = (fromCellLbl || fromLocName) || "Без места";
        const shipNo =
          ((selectedDoc?.assignmentNo ?? "").trim() ||
            (line.taskNumber ?? "").trim() ||
            "—");
        appendOperationLog({
          type: "SHIPPING_PICK",
          legalEntityId: line.legalEntityId,
          legalEntityName: line.legalEntityName,
          taskId: (selectedDoc?.id ?? line.taskId ?? "").trim() || line.taskId,
          taskNumber: shipNo,
          description: buildShippingCellPickLogDescription(
            "Товар подобран из ячейки",
            line.name,
            qty,
            cellLabel,
            shipNo,
          ),
        });
        toast.success("Подбор выполнен");
      } catch {
        toast.error("Не удалось выполнить подбор");
      }
    },
    [
      selectedShipmentPickRows,
      pickDraftByShipment,
      addInventoryMovements,
      updateOutboundDraft,
      locationById,
      selectedDoc,
      appendOperationLog,
    ],
  );

  const undoPickFromCell = React.useCallback(
    async (shipmentId: string) => {
      if (!selectedDoc) return;
      const shipmentsDoc = Array.isArray(selectedDoc.shipments) ? selectedDoc.shipments : [];
      const wfUi = shippingWorkflowFromGroup(shipmentsDoc);
      if (wfUi === "cancelled") {
        toast.info("Отгрузка отменена");
        return;
      }
      if (isShippingTerminal(wfUi) || isShipmentFinalizeBlockedAlreadyDone(selectedDoc)) {
        toast.info("Отгрузка уже завершена");
        return;
      }
      if (undoingPickId === shipmentId || isUpdatingOutboundDraft || isAppendingMovements) return;

      const latestShipment = (data ?? []).find((s) => s.id === shipmentId);
      if (!latestShipment) return;

      const factRaw = outboundPickedQty(latestShipment) ?? 0;
      const fact = Math.max(0, Math.trunc(Number(factRaw) || 0));
      const packed = outboundPackedQtyAssemblyGate(latestShipment);
      if (isOutboundShipmentRowTerminalGate(latestShipment)) {
        toast.info("Отгрузка уже завершена");
        return;
      }

      if (fact <= 0) {
        toast.error("Нечего отменять");
        return;
      }
      if (packed > 0) {
        toast.error("Нельзя отменить подбор: товар уже упакован");
        return;
      }

      const mvRaw = inventoryMovements ?? [];
      const safeMoves = Array.isArray(mvRaw) ? mvRaw : [];
      const pickMoves = safeMoves.filter(
        (m) =>
          m.type === "OUTBOUND" &&
          m.source === "shipping" &&
          (m.itemId ?? "").trim() === shipmentId,
      );
      if (pickMoves.length === 0) {
        toast.error("Не найдены движения подбора для отмены");
        return;
      }

      let sumPickQty = 0;
      for (const m of pickMoves) {
        const q = Number(m.qty);
        sumPickQty += Number.isFinite(q) ? q : 0;
      }
      const totalOutAbs = Math.abs(Math.trunc(Number(sumPickQty) || 0));
      if (totalOutAbs > fact) {
        toast.error("Нельзя отменить подбор больше, чем было подобрано");
        return;
      }
      if (totalOutAbs < fact) {
        toast.error("Не все подобранные единицы связаны со движениями подбора");
        return;
      }
      const missingLoc = pickMoves.some((m) => !(m.locationId ?? "").trim());
      if (missingLoc) {
        toast.error("У движения подбора не указана ячейка возврата");
        return;
      }

      setUndoingPickId(shipmentId);
      const ts = new Date().toISOString();
      try {
        const inMoves: InventoryMovement[] = pickMoves.map((m, idx) => {
          const absQty = Math.trunc(Math.abs(Number.isFinite(Number(m.qty)) ? Number(m.qty) : 0));
          if (absQty <= 0) throw new Error("invalid_pick_qty");
          return {
            id: `undo-pick-${m.id}-${ts}-${idx}`,
            type: "INBOUND" as const,
            source: "shipping" as const,
            taskId: m.taskId,
            taskNumber: m.taskNumber,
            legalEntityId: m.legalEntityId,
            legalEntityName: m.legalEntityName,
            warehouseName: m.warehouseName,
            locationId: (m.locationId ?? "").trim(),
            itemId: m.itemId,
            name: m.name,
            article: m.article ?? m.sku ?? "",
            sku: m.sku ?? m.article ?? "",
            barcode: m.barcode ?? "",
            marketplace: m.marketplace,
            color: m.color ?? "—",
            size: m.size ?? "—",
            qty: absQty,
            createdAt: ts,
          };
        });
        await addInventoryMovements(inMoves);
        const newFactRaw = fact + Math.trunc(sumPickQty);
        const newFact = Math.max(0, Number.isFinite(newFactRaw) ? newFactRaw : 0);
        await updateOutboundDraft({
          id: shipmentId,
          patch: {
            pickedUnits: newFact,
            shippedUnits: newFact,
            updatedAt: ts,
          },
        });
        const locLabels = [
          ...new Set(
            pickMoves.map((m) => {
              const lid = (m.locationId ?? "").trim();
              return lid ? (locationById.get(lid)?.name ?? lid) : "Без места";
            }),
          ),
        ];
        const cellCombined = locLabels.filter(Boolean).join(", ") || "Без места";
        const itemLabel = (pickMoves[0]?.name ?? "").trim() || "Товар";
        const shipNo =
          ((pickMoves[0]?.taskNumber ?? selectedDoc?.assignmentNo) ?? "").trim() ||
          ((selectedDoc?.assignmentNo ?? "").trim() || "—");
        appendOperationLog({
          type: "SHIPPING_PICK_CANCEL",
          legalEntityId: pickMoves[0]?.legalEntityId ?? latestShipment.legalEntityId,
          legalEntityName: pickMoves[0]?.legalEntityName ?? (entities?.find((e) => e.id === latestShipment.legalEntityId)?.shortName ?? latestShipment.legalEntityId),
          taskId: (selectedDoc?.id ?? pickMoves[0]?.taskId ?? "").trim() || pickMoves[0]?.taskId,
          taskNumber: shipNo,
          description: buildShippingCellPickLogDescription(
            "Подбор отменён",
            itemLabel,
            totalOutAbs,
            cellCombined,
            shipNo,
          ),
        });
        toast.success("Подбор отменён");
      } catch {
        toast.error("Не удалось отменить подбор");
      } finally {
        setUndoingPickId(null);
      }
    },
    [
      selectedDoc,
      data,
      inventoryMovements,
      undoingPickId,
      isUpdatingOutboundDraft,
      isAppendingMovements,
      addInventoryMovements,
      updateOutboundDraft,
      locationById,
      appendOperationLog,
      entities,
    ],
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
              <SelectItem value="cancelled">Отменена</SelectItem>
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
                { id: "shipped" as const, label: "Отгружено" },
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
                <Table className="min-w-[1440px] table-auto">
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
                      <TableHead className="h-9 w-10 px-2 py-2">
                        <Checkbox
                          disabled={documentBulkSelectableIdsOnPage.length === 0}
                          checked={
                            documentBulkSelectableIdsOnPage.length > 0 &&
                            documentBulkSelectableIdsOnPage.every((id) => selectedShipmentIds.includes(id))
                              ? true
                              : documentBulkSelectableIdsOnPage.some((id) => selectedShipmentIds.includes(id))
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() => {
                            const bulkIds = documentBulkSelectableIdsOnPage;
                            const allSelected =
                              bulkIds.length > 0 && bulkIds.every((id) => selectedShipmentIds.includes(id));
                            setSelectedShipmentIds((prev) => {
                              const cur = new Set(Array.isArray(prev) ? prev : []);
                              if (allSelected) {
                                bulkIds.forEach((id) => cur.delete(id));
                              } else {
                                bulkIds.forEach((id) => cur.add(id));
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
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Подобрано</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Упаковано</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Перерасход</TableHead>
                      <TableHead className="h-9 w-[110px] whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const docShipRaw = doc?.shipments ?? [];
                      const docShipSafe = Array.isArray(docShipRaw) ? docShipRaw : [];
                      const uiStatus = shippingWorkflowFromGroup(docShipSafe);
                      const currentStage = shippingStageIndex(uiStatus);
                      const rem = Math.max(0, Number(doc.planned ?? 0) - Number(doc.fact ?? 0));
                      const over = Math.max(0, Number(doc.fact ?? 0) - Number(doc.planned ?? 0));
                      const assemblyPackGateOk = outboundShipmentsPackedQtyPlanSatisfied(docShipSafe);
                      const isSel = selectedId === doc.id;
                      const legalLabel = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
                      const stockWarnLines = shippingDocStockWarning.get(doc.id)?.lines ?? [];
                      const stockWarnTooltip = formatShippingStockTooltip(stockWarnLines);
                      const showStockWarn = stockWarnLines.length > 0;
                      const hasShippingProblem =
                        !isShippingTerminal(uiStatus) &&
                        uiStatus !== "cancelled" &&
                        (showStockWarn || rem > 0 || doc.fact < doc.planned);
                      const stockWarnAria =
                        stockWarnLines.length === 1
                          ? "Недостаточно доступного товара по одной позиции. Подробности в подсказке."
                          : `Недостаточно доступного товара по ${stockWarnLines.length} позициям. Подробности в подсказке.`;
                      const rowSelected = selectedShipmentIds.includes(doc.id);
                      const readOnlyShipment = isShippingTerminal(uiStatus) || uiStatus === "cancelled";
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
                              uiStatus === "shipped" ? "bg-emerald-50/40" : "",
                              uiStatus === "shipped_with_diff" ? "bg-amber-50/60" : "",
                              uiStatus === "cancelled" ? "bg-slate-100/70" : "",
                              openTaskHighlightId === doc.id &&
                                "z-[1] ring-2 ring-amber-400/50 ring-inset bg-amber-50/50",
                            )}
                            onClick={() => setSelectedId((p) => (p === doc.id ? null : doc.id))}
                          >
                            <TableCell className="w-10 px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                disabled={isShipmentFinalizeBlockedAlreadyDone(doc)}
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
                                ) : uiStatus === "cancelled" ? (
                                  <span className="inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-slate-200 text-slate-800 ring-slate-300">
                                    Отменена
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
                            <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{doc.packed}</TableCell>
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
                              <TableCell colSpan={15} className="align-top p-0">
                                <div className="space-y-4 border-t border-slate-200 p-4">
                                  <div>
                                    <h3 className="font-display text-base font-semibold text-slate-900">Задание №{doc.assignmentNo}</h3>
                                    <p className="mt-1 text-sm text-slate-600">{shippingDispatcherHint(uiStatus)}</p>
                                  </div>
                                  {uiStatus === "cancelled" ? (
                                    <div className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2">
                                      <p className="text-sm font-medium text-slate-800">Отгрузка отменена</p>
                                    </div>
                                  ) : uiStatus === "shipped" ? (
                                    <div className="rounded-md border border-emerald-200 bg-emerald-50/90 px-3 py-2">
                                      <p className="text-sm font-medium text-emerald-800">Отгрузка завершена</p>
                                      <p className="mt-1 text-xs tabular-nums text-emerald-900/85">
                                        Дата отгрузки:{" "}
                                        {formatTaskArchiveDateLabel(outboundShipmentsShippedAtIso(doc?.shipments ?? []))}
                                      </p>
                                    </div>
                                  ) : uiStatus === "shipped_with_diff" ? (
                                    <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2">
                                      <p className="text-sm font-medium text-amber-900">Отгружено с расхождением</p>
                                      <p className="mt-1 text-xs tabular-nums text-amber-900/85">
                                        Дата отгрузки:{" "}
                                        {formatTaskArchiveDateLabel(outboundShipmentsShippedAtIso(doc?.shipments ?? []))}
                                      </p>
                                      <p className="mt-1 text-xs text-amber-900/90">
                                        Причина: {doc.differenceReason?.trim() || "—"}
                                      </p>
                                    </div>
                                  ) : null}
                                  {!readOnlyShipment ? (
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
                                  ) : null}
                                  {!readOnlyShipment ? (
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
                                  ) : null}
                                  {!readOnlyShipment && hasShippingProblem ? (
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
                                  {readOnlyShipment ? (
                                    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                      <div>
                                        <span className="text-slate-500">Статус</span>
                                        <div className="mt-0.5">
                                          {uiStatus === "shipped_with_diff" ? (
                                            <span className="inline-flex min-w-[88px] justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-amber-100 text-amber-800 ring-amber-200">
                                              Отгружено с расхождением
                                            </span>
                                          ) : uiStatus === "cancelled" ? (
                                            <StatusBadge status="cancelled" />
                                          ) : (
                                            <StatusBadge status={uiStatus} />
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-slate-500">План</span>
                                        <div className="font-medium tabular-nums text-slate-900">{doc.planned}</div>
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Подобрано</span>
                                        <div className="font-medium tabular-nums text-slate-900">{doc.fact}</div>
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Упаковано</span>
                                        <div className="font-medium tabular-nums text-slate-900">{doc.packed}</div>
                                      </div>
                                    </div>
                                  ) : (
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
                                          ) : uiStatus === "cancelled" ? (
                                            <StatusBadge status="cancelled" />
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
                                        <span className="text-slate-500">Подобрано</span>
                                        <div className="font-medium tabular-nums text-slate-900">{doc.fact}</div>
                                      </div>
                                      <div>
                                        <span className="text-slate-500">Упаковано</span>
                                        <div className="font-medium tabular-nums text-slate-900">{doc.packed}</div>
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
                                  )}
                                  {!readOnlyShipment &&
                                  doc.fact > 0 &&
                                  shippingOutboundPackedQtyGateSum(doc.shipments ?? []) < Number(doc.fact ?? 0) ? (
                                    <p className="text-xs font-medium text-amber-800">Упаковка не завершена: упаковано меньше подобранного.</p>
                                  ) : !readOnlyShipment &&
                                    doc.fact > 0 &&
                                    shippingOutboundPackedQtyGateSum(doc.shipments ?? []) >= Number(doc.fact ?? 0) ? (
                                    <p className="text-xs font-medium text-emerald-800">Товар по подобранному объёму полностью упакован.</p>
                                  ) : null}
                                  {!readOnlyShipment && (doc.planned > doc.fact || doc.fact > doc.planned) && (
                                    <div className="flex flex-wrap gap-3 text-sm">
                                      {doc.planned > doc.fact ? (
                                        <span className="font-medium text-amber-800">Осталось: {rem}</span>
                                      ) : null}
                                      {doc.fact > doc.planned ? <span className="font-medium text-red-700">Перерасход: {over}</span> : null}
                                    </div>
                                  )}
                                  {!readOnlyShipment &&
                                  uiStatus === "assembled" &&
                                  !assemblyPackGateOk &&
                                  !canShipmentDiffFinalize(doc) ? (
                                    <p className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-medium text-amber-900">
                                      Сборка завершена некорректно: не все товары упакованы
                                    </p>
                                  ) : null}
                                  {readOnlyShipment || viewMode === "archive"
                                    ? null
                                    : (
                                    <div className="space-y-2">
                                      {(() => {
                                        const shipmentsRow = doc?.shipments ?? [];
                                        const shipmentsSafe = Array.isArray(shipmentsRow) ? shipmentsRow : [];
                                        const allLinesPackedDoc = shippingGroupAllLinesPacked(shipmentsSafe);
                                        const fullyPickedVsPlan =
                                          shipmentsSafe.length > 0 &&
                                          shippingGroupFullyPickedForPlan(shipmentsSafe);
                                        const showCompleteAssemblyUi =
                                          !isShippingTerminal(uiStatus) && uiStatus !== "assembled";
                                        return (
                                          <>
                                            {showCompleteAssemblyUi && !allLinesPackedDoc ? (
                                              fullyPickedVsPlan ? (
                                                <p className="text-xs font-medium text-amber-800">Не все товары упакованы</p>
                                              ) : (
                                                <p className="text-xs text-slate-600">Упакуйте все товары для завершения</p>
                                              )
                                            ) : null}
                                            <div className="flex flex-wrap items-center gap-2">
                                              {uiStatus === "assembled" ? (
                                                canShipmentExactFinalize(doc) ? (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => void finalizeShipmentExact(doc)}
                                                    disabled={
                                                      confirmingShipmentId === doc.id ||
                                                      isUpdatingOutboundDraft ||
                                                      bulkConfirming ||
                                                      bulkTakingToWork
                                                    }
                                                  >
                                                    Подтвердить отгрузку
                                                  </Button>
                                                ) : canShipmentDiffFinalize(doc) ? (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => openShipmentDiffFinalizeDialog(doc)}
                                                    disabled={
                                                      confirmingShipmentId === doc.id ||
                                                      isUpdatingOutboundDraft ||
                                                      bulkConfirming ||
                                                      bulkTakingToWork ||
                                                      Boolean(diffReasonDialogOpen)
                                                    }
                                                  >
                                                    Завершить с расхождением
                                                  </Button>
                                                ) : (
                                                  <p className="text-sm font-medium text-amber-800">
                                                    Нельзя отгрузить: ничего не упаковано
                                                  </p>
                                                )
                                              ) : isShippingTerminal(uiStatus) ? (
                                                <Button type="button" size="sm" variant="secondary" disabled>
                                                  {uiStatus === "shipped" ? "Отгружено" : "Сборка завершена"}
                                                </Button>
                                              ) : uiStatus === "processing" || uiStatus === "assembling" ? (
                                                <>
                                                  {canShipmentDiffFinalize(doc) ? (
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant="secondary"
                                                      onClick={() => openShipmentDiffFinalizeDialog(doc)}
                                                      disabled={
                                                        confirmingShipmentId === doc.id ||
                                                        isUpdatingOutboundDraft ||
                                                        bulkConfirming ||
                                                        bulkTakingToWork ||
                                                        Boolean(diffReasonDialogOpen)
                                                      }
                                                    >
                                                      Завершить с расхождением
                                                    </Button>
                                                  ) : null}
                                                  <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                                    {hasShippingProblem ? "Продолжить с расхождением" : "Продолжить сборку"}
                                                  </Button>
                                                </>
                                              ) : (
                                                <>
                                                  {canShipmentDiffFinalize(doc) ? (
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant="secondary"
                                                      onClick={() => openShipmentDiffFinalizeDialog(doc)}
                                                      disabled={
                                                        confirmingShipmentId === doc.id ||
                                                        isUpdatingOutboundDraft ||
                                                        bulkConfirming ||
                                                        bulkTakingToWork ||
                                                        Boolean(diffReasonDialogOpen)
                                                      }
                                                    >
                                                      Завершить с расхождением
                                                    </Button>
                                                  ) : null}
                                                  <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                                    Открыть в упаковщике
                                                  </Button>
                                                </>
                                              )}
                                              {canShowCancelShipmentButton(uiStatus) ? (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="border-red-200 text-red-800 hover:bg-red-50"
                                                  onClick={() => void cancelShipmentGroup(doc)}
                                                  disabled={
                                                    cancellingShipmentId === doc.id ||
                                                    confirmingShipmentId === doc.id ||
                                                    isUpdatingOutboundDraft ||
                                                    isAppendingMovements ||
                                                    bulkConfirming ||
                                                    bulkTakingToWork ||
                                                    undoingPickId !== null
                                                  }
                                                >
                                                  {cancellingShipmentId === doc.id ? "Отмена…" : "Отменить отгрузку"}
                                                </Button>
                                              ) : null}
                                              {showCompleteAssemblyUi && !canShipmentDiffFinalize(doc) ? (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="secondary"
                                                  disabled={
                                                    !allLinesPackedDoc ||
                                                    assemblyCompletingId === doc.id ||
                                                    confirmingShipmentId === doc.id ||
                                                    isUpdatingOutboundDraft ||
                                                    bulkConfirming ||
                                                    bulkTakingToWork
                                                  }
                                                  onClick={() => void completeShipmentAssembly(doc)}
                                                >
                                                  {assemblyCompletingId === doc.id ? "Завершение…" : "Завершить сборку"}
                                                </Button>
                                              ) : null}
                                            </div>
                                          </>
                                        );
                                      })()}
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
                                  {!readOnlyShipment && selectedShipmentPickRows.length > 0 ? (
                                    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                                      <p className="text-xs font-medium text-slate-600">Подбор из ячейки хранения</p>
                                      <div className="space-y-2">
                                        {selectedShipmentPickRows.map((line) => {
                                          const draft = pickDraftByShipment[line.shipmentId] ?? { locationId: "", qty: "" };
                                          const selectedCell = line.storageOptions.find((opt) => opt.locationId === draft.locationId);
                                          const remLine = Math.max(0, Math.trunc(Number(line.remaining ?? 0) || 0));
                                          const maxQty = Math.min(remLine, Math.max(0, Math.trunc(Number(selectedCell?.available ?? 0) || 0)));
                                          const pickingDone = remLine <= 0;
                                          const pickQtyParsed = Math.trunc(Number(draft.qty) || 0);
                                          const pickQtyOk =
                                            draft.qty.trim() !== "" && pickQtyParsed > 0 && pickQtyParsed <= maxQty;
                                          const planLine = Math.max(0, Math.trunc(Number(line.plan ?? 0) || 0));
                                          const factLine = Math.max(0, Math.trunc(Number(line.fact ?? 0) || 0));
                                          const packedLine = Math.max(0, Math.trunc(Number(line.packedQtyEffective ?? 0) || 0));
                                          const showUndoPick =
                                            factLine > 0 &&
                                            packedLine <= 0 &&
                                            !isShippingTerminal(uiStatus);
                                          return (
                                            <div key={line.shipmentId} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-12 md:items-end">
                                              <div className="md:col-span-4">
                                                <div className="text-sm font-medium text-slate-900">{line.name}</div>
                                                <div className="text-xs text-slate-600">
                                                  {line.barcode} · Осталось: {remLine.toLocaleString("ru-RU")}
                                                </div>
                                                {planLine > 0 && factLine <= 0 ? (
                                                  <div className="mt-1 text-xs text-slate-600">Ожидает подбора</div>
                                                ) : pickingDone ? (
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
                                                <div className="flex flex-wrap gap-1">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8 min-w-[104px] flex-1 sm:flex-none sm:min-w-[100px]"
                                                    onClick={() => void submitPickFromCell(line.shipmentId)}
                                                    disabled={
                                                      line.storageOptions.length === 0 ||
                                                      pickingDone ||
                                                      !draft.locationId ||
                                                      !pickQtyOk ||
                                                      isUpdatingOutboundDraft ||
                                                      isAppendingMovements ||
                                                      undoingPickId === line.shipmentId
                                                    }
                                                  >
                                                    Подобрать
                                                  </Button>
                                                  {showUndoPick ? (
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-8 min-w-[104px] flex-1 sm:flex-none sm:min-w-[120px]"
                                                      onClick={() => void undoPickFromCell(line.shipmentId)}
                                                      disabled={
                                                        isUpdatingOutboundDraft ||
                                                        isAppendingMovements ||
                                                        undoingPickId === line.shipmentId
                                                      }
                                                    >
                                                      {undoingPickId === line.shipmentId ? "Отмена…" : "Отменить подбор"}
                                                    </Button>
                                                  ) : null}
                                                </div>
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
                (pendingBulkDiffDocs.length > 0 || pendingBulkExactDocs.length > 0
                  ? pendingBulkDiffDocs.some(
                      (d) => shipmentDocPackedTotal(d) <= 0 || !canShipmentDiffFinalize(d),
                    ) || pendingBulkExactDocs.some((d) => !canShipmentExactFinalize(d))
                  : !pendingDiffDoc ||
                    confirmingShipmentId === pendingDiffDoc.id ||
                    shipmentDocPackedTotal(pendingDiffDoc) <= 0 ||
                    !canShipmentDiffFinalize(pendingDiffDoc))
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
