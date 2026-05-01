import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import TaskItemsTable, { type TaskItemRow } from "@/components/app/TaskItemsTable";
import TaskRegistryTable from "@/components/app/TaskRegistryTable";
import StatusBadge from "@/components/app/StatusBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import {
  useAppendOperationLog,
  useInboundSupplies,
  useInventoryMovements,
  useLegalEntities,
  useOutboundShipments,
  useProductCatalog,
} from "@/hooks/useWmsMock";
import type { InventoryMovement, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { normalizeWorkflowStatus, workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";
import {
  planFactDiscrepancyText,
  planFactLineBadgeClass,
  planFactLineStatusLabel,
  planFactOverrun,
  planFactRemaining,
  planFactRowBgClass,
} from "@/lib/planFactDiscrepancy";
import { toast } from "sonner";
import {
  buildPlanFactCompleteWarning,
  buildPlanFactMismatchLogDescription,
  getTaskValidation,
} from "@/utils/wmsValidation";
import { playScanErrorSound, playScanSuccessSound } from "@/utils/scanFeedbackSound";
import {
  mergePriorityFromShipments,
  outboundPrioritySortKey,
  type OutboundTaskPriority,
} from "@/lib/outboundTaskPriority";
import { formatTaskArchiveDateLabel, outboundArchiveSortKey, outboundShipmentsCompletedAtIso } from "@/lib/taskArchiveDates";
import {
  outboundPackCapForShipment,
  outboundPackRemainingForShipment,
  outboundPackedQtyAssemblyGate,
  outboundPackedQtyDisplay,
  outboundPackedQtyStoredOrZero,
  outboundPickedQty,
  outboundShipmentsPackedQtyPlanSatisfied,
} from "@/lib/outboundPickPackQty";

type PackingAssignment = {
  id: string;
  display: string;
  legalEntityId: string;
  shipments: OutboundShipment[];
  workflowStatus: TaskWorkflowStatus;
  priority: OutboundTaskPriority;
};

type LastScanResult =
  | { status: "idle" }
  | { status: "success"; title: string; hint?: string }
  | { status: "error"; message: string };

/** Строка отгрузки закрыта отгрузчиком — упаковка и подбор недоступны. */
function isOutboundShipmentRowTerminal(sh: OutboundShipment): boolean {
  const wf = String(sh.workflowStatus ?? "");
  return wf === "shipped" || wf === "shipped_with_diff";
}

function isOutboundShipmentRowCancelled(sh: OutboundShipment): boolean {
  const wf = String(sh.workflowStatus ?? "");
  const st = String(sh.status ?? "").trim();
  return wf === "cancelled" || st === "отменено";
}

function isOutboundShipmentRowClosedForPacking(sh: OutboundShipment): boolean {
  return isOutboundShipmentRowTerminal(sh) || isOutboundShipmentRowCancelled(sh);
}

type ScanLine = {
  key: string;
  name: string;
  barcode: string;
  article: string;
  marketplace: "wb" | "ozon" | "yandex";
  warehouse: string;
  color: string;
  size: string;
  plan: number;
  picked: number;
  packed: number;
  packedDisplay: number;
  shipmentRefs: Array<{ shipmentId: string; plan: number; picked: number; packed: number; packedDisplay: number }>;
};

function outboundHasShippingPickForShipment(movements: InventoryMovement[], shipmentId: string): boolean {
  const safe = Array.isArray(movements) ? movements : [];
  return safe.some((m) => m.type === "OUTBOUND" && m.source === "shipping" && m.itemId === shipmentId);
}

/** Сообщения сканирования (п. 4–5 ТЗ упаковщика). */
const SCAN_ERR_NOT_PICKED = "Товар не подобран. Сначала выполните подбор.";
const SCAN_ERR_ALL_PACKED = "Весь подобранный товар уже упакован.";

const PackingPage = () => {
  const { data: outbound, isLoading, error, updateOutboundDraft, setOutboundStatus, isUpdatingOutboundDraft, isUpdatingOutbound } =
    useOutboundShipments();
  useInboundSupplies();
  const { addInventoryMovements, data: movementData } = useInventoryMovements();
  const { data: catalog } = useProductCatalog();
  const { data: legal } = useLegalEntities();
  const appendOperationLog = useAppendOperationLog();
  const { legalEntityId } = useAppFilters();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [startedAssignmentId, setStartedAssignmentId] = React.useState<string | null>(null);
  const [packingArchivePeekId, setPackingArchivePeekId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus>("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [mpFilter, setMpFilter] = React.useState<"all" | "wb" | "ozon" | "yandex">("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  React.useEffect(() => {
    if (searchParams.get("status") !== "processing") return;
    setStatusFilter("processing");
    setViewMode("active");
  }, [searchParams]);
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);
  const [flashState, setFlashState] = React.useState<"ok" | "error" | null>(null);
  const [finalizePlanFactWarning, setFinalizePlanFactWarning] = React.useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = React.useState<LastScanResult>({ status: "idle" });
  const [highlightedLineKey, setHighlightedLineKey] = React.useState<string | null>(null);
  const [lineHighlightTone, setLineHighlightTone] = React.useState<"success" | "error" | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const lineHighlightTimerRef = React.useRef<number | null>(null);

  const clearLineHighlightLater = React.useCallback(() => {
    if (lineHighlightTimerRef.current != null) window.clearTimeout(lineHighlightTimerRef.current);
    lineHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedLineKey(null);
      setLineHighlightTone(null);
      lineHighlightTimerRef.current = null;
    }, 1600);
  }, []);

  React.useEffect(() => {
    return () => {
      if (lineHighlightTimerRef.current != null) window.clearTimeout(lineHighlightTimerRef.current);
    };
  }, []);

  const allShipments = React.useMemo(() => {
    const rows = outbound ?? [];
    return rows
      .filter((x) => legalEntityId === "all" || x.legalEntityId === legalEntityId)
      .sort((a, b) => (a.assignmentNo || a.id).localeCompare(b.assignmentNo || b.id, "ru"));
  }, [outbound, legalEntityId]);

  const allGroupedAssignments = React.useMemo<PackingAssignment[]>(() => {
    const groups = new Map<string, PackingAssignment>();
    for (const sh of allShipments) {
      const assignmentNo = sh.assignmentNo?.trim() || sh.assignmentId?.trim() || sh.id;
      const assignmentId = `${sh.legalEntityId}::${sh.assignmentId ?? sh.assignmentNo ?? sh.id}`;
      const entityName = legal?.find((x) => x.id === sh.legalEntityId)?.shortName ?? sh.legalEntityId;
      const dateLabel = sh.createdAt ? format(parseISO(sh.createdAt), "dd.MM.yyyy", { locale: ru }) : "без даты";
      const line = `№ ${assignmentNo} | ${entityName} | ${dateLabel}`;
      const existing = groups.get(assignmentId);
      if (!existing) {
        groups.set(assignmentId, {
          id: assignmentId,
          display: line,
          legalEntityId: sh.legalEntityId,
          shipments: [sh],
          workflowStatus: (sh.workflowStatus ?? "pending") as TaskWorkflowStatus,
          priority: mergePriorityFromShipments([sh]),
        });
      } else {
        existing.shipments.push(sh);
      }
    }
    return Array.from(groups.values()).map((group) => {
      const priority = mergePriorityFromShipments(group.shipments);
      const workflowStatus = workflowFromOutboundGroup(group.shipments);
      return { ...group, workflowStatus, priority };
    });
  }, [allShipments, legal]);

  const assignments = React.useMemo<PackingAssignment[]>(() => {
    const q = search.trim().toLowerCase();
    return allGroupedAssignments
      .filter((group) => {
        const first = group.shipments[0];
        if (!first) return false;
        const wfNorm = normalizeWorkflowStatus(group.workflowStatus);
        const groupShipRaw = group.shipments ?? [];
        const groupShipSafe = Array.isArray(groupShipRaw) ? groupShipRaw : [];
        const packPlanGateOk = outboundShipmentsPackedQtyPlanSatisfied(groupShipSafe);
        const allRowsShippedOut =
          groupShipSafe.length > 0 && groupShipSafe.every((sh) => isOutboundShipmentRowTerminal(sh));
        const packingDone =
          wfNorm === "cancelled" ||
          allRowsShippedOut ||
          wfNorm === "shipped" ||
          wfNorm === "shipped_with_diff" ||
          (wfNorm === "completed" && packPlanGateOk) ||
          (wfNorm === "assembled" && packPlanGateOk);
        if (viewMode === "active" && packingDone) return false;
        if (viewMode === "archive" && !packingDone) return false;
        if (statusFilter !== "all" && normalizeWorkflowStatus(group.workflowStatus) !== statusFilter) return false;
        if (warehouseFilter !== "all" && first.sourceWarehouse !== warehouseFilter) return false;
        if (mpFilter !== "all" && first.marketplace !== mpFilter) return false;
        const created = Date.parse(first.createdAt || "");
        if (dateFrom) {
          const from = Date.parse(`${dateFrom}T00:00:00`);
          if (Number.isFinite(from) && created < from) return false;
        }
        if (dateTo) {
          const to = Date.parse(`${dateTo}T23:59:59`);
          if (Number.isFinite(to) && created > to) return false;
        }
        if (!q) return true;
        const entity = legal?.find((x) => x.id === group.legalEntityId)?.shortName ?? group.legalEntityId;
        const lineText = group.shipments.map((s) => `${s.importArticle ?? ""} ${s.importBarcode ?? ""}`).join(" ").toLowerCase();
        const no = first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id;
        return `${no} ${entity} ${lineText}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const pr = outboundPrioritySortKey(a.priority) - outboundPrioritySortKey(b.priority);
        if (pr !== 0) return pr;
        if (viewMode === "archive") {
          return outboundArchiveSortKey(b.shipments) - outboundArchiveSortKey(a.shipments);
        }
        const da = Date.parse(a.shipments[0]?.createdAt || "") || 0;
        const db = Date.parse(b.shipments[0]?.createdAt || "") || 0;
        return db - da;
      });
  }, [allGroupedAssignments, legal, search, viewMode, statusFilter, warehouseFilter, mpFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    setPackingArchivePeekId(null);
  }, [viewMode]);
  const warehouses = React.useMemo(
    () => Array.from(new Set(allGroupedAssignments.map((a) => a.shipments[0]?.sourceWarehouse || ""))).filter(Boolean),
    [allGroupedAssignments],
  );

  const packingArchivePeekAssignment =
    packingArchivePeekId == null ? null : (assignments.find((a) => a.id === packingArchivePeekId) ?? null);
  const packingArchivePeekRows = React.useMemo<TaskItemRow[]>(() => {
    const peekRaw = packingArchivePeekAssignment?.shipments ?? [];
    const peekShipments = Array.isArray(peekRaw) ? peekRaw : [];
    if (!peekShipments.length) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    return peekShipments.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const name = (sh.importName || product?.name || "").trim() || "—";
      const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      const color = (sh.importColor || product?.color || "").trim() || "—";
      const size = (sh.importSize || product?.size || "").trim() || "—";
      const plan = Number(sh.plannedUnits ?? 0) || 0;
      const fact = Number(outboundPickedQty(sh) ?? 0) || 0;
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
        shippingPackedQty: outboundPackedQtyAssemblyGate(sh),
        warehouse: sh.sourceWarehouse || "—",
        status: sh.workflowStatus ?? "pending",
      };
    });
  }, [packingArchivePeekAssignment, catalog]);

  const startedAssignment =
    startedAssignmentId == null ? null : (allGroupedAssignments.find((x) => x.id === startedAssignmentId) ?? null);

  const startedShipmentList = React.useMemo(() => {
    const s = startedAssignment?.shipments;
    return Array.isArray(s) ? s : [];
  }, [startedAssignment]);

  const movementsSafe = React.useMemo(
    () => (Array.isArray(movementData) ? movementData : []),
    [movementData],
  );

  React.useEffect(() => {
    const itemsSafe = Array.isArray(startedShipmentList) ? startedShipmentList : [];
    if (!itemsSafe.length) {
      setFinalizePlanFactWarning(null);
      return;
    }
    const items = itemsSafe.map((sh) => ({
      plannedQty: Number(sh.plannedUnits) || 0,
      factQty: outboundPackedQtyDisplay(sh),
    }));
    const v = getTaskValidation(items);
    if (v.totalRemaining === 0 && v.totalOver === 0) setFinalizePlanFactWarning(null);
  }, [startedShipmentList]);

  const scanLines = React.useMemo<ScanLine[]>(() => {
    if (!startedAssignment) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    const lineMap = new Map<string, ScanLine>();
    const shipRows = Array.isArray(startedShipmentList) ? startedShipmentList : [];
    for (const sh of shipRows) {
      const product = byProduct.get(sh.productId) ?? null;
      const article = (sh.importArticle || product?.supplierArticle || "").trim();
      const name = (sh.importName || product?.name || "").trim();
      const color = (sh.importColor || product?.color || "").trim();
      const size = (sh.importSize || product?.size || "").trim();
      const barcode = (sh.importBarcode || product?.barcode || "").trim();
      const lineKey = `${article}|${color}|${size}|${barcode}`;
      const existing = lineMap.get(lineKey);
      const plan = Number(sh.plannedUnits) || 0;
      const picked = outboundPickedQty(sh);
      const packed = outboundPackedQtyStoredOrZero(sh);
      const packedDisplay = packed;
      if (!existing) {
        lineMap.set(lineKey, {
          key: lineKey,
          name,
          barcode,
          article,
          marketplace: sh.marketplace,
          warehouse: sh.sourceWarehouse || "—",
          color,
          size,
          plan,
          picked,
          packed,
          packedDisplay,
          shipmentRefs: [{ shipmentId: sh.id, plan, picked, packed, packedDisplay }],
        });
      } else {
        existing.plan += plan;
        existing.picked += picked;
        existing.packed += packed;
        existing.packedDisplay += packedDisplay;
        existing.shipmentRefs.push({ shipmentId: sh.id, plan, picked, packed, packedDisplay });
      }
    }
    return Array.from(lineMap.values()).sort((a, b) => a.article.localeCompare(b.article, "ru"));
  }, [startedAssignment, startedShipmentList, catalog]);

  const progress = React.useMemo(() => {
    const totalPlan = scanLines.reduce((sum, line) => sum + line.plan, 0);
    /** Сколько максимально можно упаковать при текущих подбор (min(план, подобрано) по строкам). */
    const totalPackCap = scanLines.reduce(
      (sum, line) => sum + line.shipmentRefs.reduce((s, r) => s + r.picked, 0),
      0,
    );
    const totalPacked = scanLines.reduce((sum, line) => sum + line.packed, 0);
    const totalPicked = scanLines.reduce((sum, line) => sum + line.picked, 0);
    const remainingPack = Math.max(0, totalPackCap - totalPacked);
    const remainingToPlan = Math.max(0, totalPlan - totalPacked);
    const overrun = Math.max(0, totalPacked - totalPlan);
    return {
      totalPlan,
      totalPackCap,
      totalPicked,
      totalPacked,
      remaining: remainingToPlan,
      remainingPack,
      overrun,
      percent: totalPlan > 0 ? Math.min(100, Math.round((totalPacked / totalPlan) * 100)) : 0,
    };
  }, [scanLines]);

  const taskNeedsReview = React.useMemo(
    () => progress.totalPlan > 0 && scanLines.some((line) => line.plan !== line.packed),
    [scanLines, progress.totalPlan],
  );

  const finalizePackPlanOk = React.useMemo(
    () => outboundShipmentsPackedQtyPlanSatisfied(startedShipmentList),
    [startedShipmentList],
  );

  const triggerFlash = React.useCallback((kind: "ok" | "error") => {
    setFlashState(kind);
    window.setTimeout(() => setFlashState(null), 500);
  }, []);

  const focusScanInput = React.useCallback(() => {
    window.setTimeout(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }, 0);
  }, []);

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code || !startedAssignment) return;
    if (startedShipmentList.some((sh) => isOutboundShipmentRowCancelled(sh))) {
      toast.info("Отгрузка отменена");
      return;
    }
    if (startedShipmentList.some((sh) => isOutboundShipmentRowTerminal(sh))) {
      toast.info("Отгрузка уже завершена");
      return;
    }
    const lineByBarcode = scanLines.find((x) => x.barcode && x.barcode === code);
    if (!lineByBarcode) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedLineKey(null);
      setLineHighlightTone(null);
      setLastScanResult({ status: "error", message: "Товар не найден" });
      const leNameErr = legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId;
      const firstRowMiss = startedShipmentList[0];
      const noErr =
        firstRowMiss?.assignmentNo?.trim() ||
        firstRowMiss?.assignmentId?.trim() ||
        firstRowMiss?.id ||
        "—";
      appendOperationLog({
        type: "SCAN_ERROR",
        legalEntityId: startedAssignment.legalEntityId,
        legalEntityName: leNameErr,
        taskId: startedAssignment.id,
        taskNumber: noErr,
        description: `Ошибка: товар не найден в задании (штрихкод: ${code})`,
      });
      toast.error("Товар не найден в задании");
      focusScanInput();
      return;
    }
    if (lineByBarcode.picked <= 0) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedLineKey(lineByBarcode.key);
      setLineHighlightTone("error");
      clearLineHighlightLater();
      setLastScanResult({ status: "error", message: SCAN_ERR_NOT_PICKED });
      const leNameErr = legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId;
      const firstRowNotPicked = startedShipmentList[0];
      const noErr =
        firstRowNotPicked?.assignmentNo?.trim() ||
        firstRowNotPicked?.assignmentId?.trim() ||
        firstRowNotPicked?.id ||
        "—";
      appendOperationLog({
        type: "SCAN_ERROR",
        legalEntityId: startedAssignment.legalEntityId,
        legalEntityName: leNameErr,
        taskId: startedAssignment.id,
        taskNumber: noErr,
        description: `Ошибка: ${SCAN_ERR_NOT_PICKED} (штрихкод: ${code})`,
      });
      toast.error(SCAN_ERR_NOT_PICKED);
      focusScanInput();
      return;
    }
    const remainingForPackedLine = lineByBarcode.shipmentRefs.reduce(
      (s, r) => s + Math.max(0, r.picked - r.packed),
      0,
    );
    if (remainingForPackedLine <= 0) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedLineKey(lineByBarcode.key);
      setLineHighlightTone("error");
      clearLineHighlightLater();
      setLastScanResult({ status: "error", message: SCAN_ERR_ALL_PACKED });
      const leNameErr = legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId;
      const firstRowPacked = startedShipmentList[0];
      const noErr =
        firstRowPacked?.assignmentNo?.trim() ||
        firstRowPacked?.assignmentId?.trim() ||
        firstRowPacked?.id ||
        "—";
      appendOperationLog({
        type: "SCAN_ERROR",
        legalEntityId: startedAssignment.legalEntityId,
        legalEntityName: leNameErr,
        taskId: startedAssignment.id,
        taskNumber: noErr,
        description: `Ошибка: ${SCAN_ERR_ALL_PACKED} (штрихкод: ${code})`,
      });
      toast.error(SCAN_ERR_ALL_PACKED);
      focusScanInput();
      return;
    }
    let shipment: OutboundShipment | undefined;
    const shipmentsSafe = Array.isArray(startedShipmentList) ? startedShipmentList : [];
    for (const r of lineByBarcode.shipmentRefs) {
      const sh = shipmentsSafe.find((x) => x.id === r.shipmentId);
      if (sh && outboundPackRemainingForShipment(sh) > 0) {
        shipment = sh;
        break;
      }
    }
    if (!shipment) {
      playScanErrorSound();
      triggerFlash("error");
      setLastScanResult({ status: "error", message: "Товар не найден" });
      focusScanInput();
      return;
    }
    const capScan = outboundPackCapForShipment(shipment);
    if (outboundPackedQtyStoredOrZero(shipment) >= capScan || capScan <= 0) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedLineKey(lineByBarcode.key);
      setLineHighlightTone("error");
      clearLineHighlightLater();
      setLastScanResult({ status: "error", message: SCAN_ERR_ALL_PACKED });
      toast.error(SCAN_ERR_ALL_PACKED);
      focusScanInput();
      return;
    }
    setIsSubmittingScan(true);
    try {
      const nextPacked = outboundPackedQtyStoredOrZero(shipment) + 1;
      await updateOutboundDraft({
        id: shipment.id,
        patch: {
          packedQty: nextPacked,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
      const leNameScan = legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId;
      const scanFirst = startedShipmentList[0];
      const noScan =
        scanFirst?.assignmentNo?.trim() ||
        scanFirst?.assignmentId?.trim() ||
        scanFirst?.id ||
        "—";
      const packedProductName = (lineByBarcode?.name ?? "").trim() || "Товар";
      const packedQtySafe = Math.max(0, Math.trunc(1));
      const shipmentNoPack =
        (shipment?.assignmentNo ?? "").trim() ||
        (shipment?.assignmentId ?? "").trim() ||
        (shipment?.id ?? "").trim() ||
        noScan.trim() ||
        "—";
      appendOperationLog({
        type: "PACK_ITEM",
        legalEntityId: startedAssignment.legalEntityId,
        legalEntityName: leNameScan,
        taskId: startedAssignment.id,
        taskNumber: (noScan ?? "").trim() || "—",
        description: `Товар упакован. Товар: ${packedProductName}; количество: ${packedQtySafe}; № отгрузки: ${shipmentNoPack}`,
      });
      setScanValue("");
      playScanSuccessSound();
      triggerFlash("ok");
      const hint = (lineByBarcode.name || lineByBarcode.article || lineByBarcode.barcode || "").trim();
      setLastScanResult({
        status: "success",
        title: "Упаковано +1",
        hint: hint || undefined,
      });
      setHighlightedLineKey(lineByBarcode.key);
      setLineHighlightTone("success");
      clearLineHighlightLater();
      focusScanInput();
      toast.success(`Упаковано: ${lineByBarcode.article || lineByBarcode.barcode}`);
    } catch {
      playScanErrorSound();
      triggerFlash("error");
      setLastScanResult({ status: "error", message: "Не удалось сохранить" });
      focusScanInput();
    } finally {
      setIsSubmittingScan(false);
    }
  };

  const finalizeAssignment = async () => {
    if (!startedAssignment || progress.totalPlan === 0) return;
    if (startedShipmentList.some((sh) => isOutboundShipmentRowCancelled(sh))) {
      toast.info("Отгрузка отменена");
      return;
    }
    if (startedShipmentList.some((sh) => isOutboundShipmentRowTerminal(sh))) {
      toast.info("Отгрузка уже завершена");
      return;
    }
    const shipListGateRaw = startedShipmentList ?? [];
    const shipListGate = Array.isArray(shipListGateRaw) ? shipListGateRaw : [];
    if (!outboundShipmentsPackedQtyPlanSatisfied(shipListGate)) {
      toast.error("Нельзя завершить: упакованы не все товары");
      return;
    }
    const taskId = startedAssignment.id;
    const invSnapshot =
      (queryClient.getQueryData<InventoryMovement[]>(["wms", "inventory-movements"]) ?? movementsSafe) ?? [];
    const shipListFin = Array.isArray(startedShipmentList) ? startedShipmentList : [];
    const planFactLineItems = shipListFin.map((sh) => ({
      plannedQty: Number(sh.plannedUnits) || 0,
      factQty: outboundPackedQtyDisplay(sh),
    }));
    const planFactValidation = getTaskValidation(planFactLineItems);
    const firstShForLog = shipListFin[0];
    const taskNoForPlanFact =
      firstShForLog?.assignmentNo?.trim() ||
      firstShForLog?.assignmentId?.trim() ||
      firstShForLog?.id ||
      "—";
    if (planFactValidation.totalRemaining > 0 || planFactValidation.totalOver > 0) {
      const desc = buildPlanFactMismatchLogDescription(taskNoForPlanFact, planFactValidation);
      if (desc) {
        appendOperationLog({
          type: "TASK_MISMATCH",
          legalEntityId: startedAssignment.legalEntityId,
          legalEntityName: legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId,
          taskId,
          taskNumber: taskNoForPlanFact,
          description: desc,
        });
      }
      setFinalizePlanFactWarning(buildPlanFactCompleteWarning(planFactValidation));
    } else {
      setFinalizePlanFactWarning(null);
    }
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    const totalShipQty = shipListFin.reduce((s, sh) => {
      const plan = Number(sh.plannedUnits) || 0;
      const pack = outboundPackedQtyDisplay(sh);
      return s + Math.min(pack, plan);
    }, 0);
    if (totalShipQty <= 0) {
      appendOperationLog({
        type: "TASK_MISMATCH",
        legalEntityId: startedAssignment.legalEntityId,
        legalEntityName: legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId,
        taskId,
        taskNumber:
        shipListFin[0]?.assignmentNo?.trim() ||
        shipListFin[0]?.assignmentId?.trim() ||
        shipListFin[0]?.id ||
          "—",
        description: "Ошибка: попытка завершить задание с расхождением План/Факт",
      });
      toast.error("Нет количества для завершения", { description: "Отсканируйте товар по заданию." });
      return;
    }
    const firstSh = shipListFin[0];
    const assignmentNo = firstSh?.assignmentNo?.trim() || firstSh?.assignmentId?.trim() || firstSh?.id || "—";
    const leName = legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId;
    const ts = new Date().toISOString();
    const hasDiscrepancy = shipListFin.some((sh) => {
      const p = Number(sh.plannedUnits) || 0;
      const f = outboundPackedQtyDisplay(sh);
      return p !== f;
    });
    const currentAssignmentId = startedAssignment.id;
    const nextAssignment =
      assignments.find((a) => {
        if (a.id === currentAssignmentId) return false;
        const w = normalizeWorkflowStatus(a.workflowStatus);
        if (w === "cancelled" || w === "shipped" || w === "shipped_with_diff") return false;
        const ar = a.shipments ?? [];
        const arSafe = Array.isArray(ar) ? ar : [];
        if (arSafe.some((sh) => isOutboundShipmentRowCancelled(sh))) return false;
        if (arSafe.some((sh) => isOutboundShipmentRowTerminal(sh))) return false;
        return w === "pending" || w === "processing" || w === "assembling";
      }) ?? null;
    try {
      const moves: InventoryMovement[] = shipListFin
        .map((sh) => {
          if (outboundHasShippingPickForShipment(invSnapshot, sh.id)) return null;
          const product = byProduct.get(sh.productId) ?? null;
          const name = (sh.importName || product?.name || "").trim() || "—";
          const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
          const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
          const color = (sh.importColor || product?.color || "").trim() || "—";
          const size = (sh.importSize || product?.size || "").trim() || "—";
          const wh = (sh.sourceWarehouse || "").trim() || "—";
          const plan = Number(sh.plannedUnits) || 0;
          const packed = outboundPackedQtyDisplay(sh);
          const shipQty = Math.min(packed, plan);
          if (shipQty <= 0) return null;
          return {
            id: `im-out-${sh.id}`,
            type: "OUTBOUND" as const,
            taskId,
            taskNumber: assignmentNo,
            legalEntityId: sh.legalEntityId,
            legalEntityName: leName,
            warehouseName: wh,
            itemId: sh.id,
            name,
            sku: article,
            article,
            barcode,
            marketplace: sh.marketplace.toUpperCase(),
            color,
            size,
            qty: -shipQty,
            createdAt: ts,
            source: "packing" as const,
          };
        })
        .filter((x) => x != null) as InventoryMovement[];
      if (moves.length) {
        await addInventoryMovements(moves);
      }
      for (const sh of shipListFin) {
        const plan = Number(sh.plannedUnits) || 0;
        const packed = outboundPackedQtyDisplay(sh);
        const shipQty = Math.min(packed, plan);
        await updateOutboundDraft({
          id: sh.id,
          patch: {
            packedQty: shipQty,
            packedUnits: shipQty,
            shippedUnits: shipQty,
            workflowStatus: "assembled",
            completedWithDiscrepancies: plan !== packed,
            completedAt: ts,
            updatedAt: ts,
          },
        });
        await setOutboundStatus({ id: sh.id, status: "отгружено", shippedUnits: shipQty });
      }
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
      await queryClient.invalidateQueries({ queryKey: ["wms", "inventory-movements"] });
      await queryClient.refetchQueries({ queryKey: ["wms", "outbound"] });
      if (hasDiscrepancy) {
        appendOperationLog({
          type: "TASK_COMPLETED_WITH_MISMATCH",
          legalEntityId: startedAssignment.legalEntityId,
          legalEntityName: leName,
          taskId,
          taskNumber: assignmentNo,
          description: "Задание завершено с расхождением",
        });
      } else {
        appendOperationLog({
          type: "PACKING_COMPLETED",
          legalEntityId: startedAssignment.legalEntityId,
          legalEntityName: leName,
          taskId,
          taskNumber: assignmentNo,
          description: `Задание №${assignmentNo} завершено`,
        });
      }
      if (hasDiscrepancy) {
        toast.warning("Задание завершено с расхождениями", { description: "Проверьте план и факт по строкам." });
      } else {
        toast.success("Задание завершено и убрано из активных.");
      }
      if (nextAssignment) {
        await startAssignment(nextAssignment);
        toast.message("Открыто следующее задание");
        focusScanInput();
      } else {
        setStartedAssignmentId(null);
        toast.message("Заданий больше нет");
      }
    } catch {
      toast.error("Не удалось завершить задание. Повторите попытку.");
    }
  };

  React.useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
    void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
      void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  React.useEffect(() => {
    if (startedAssignmentId && !allGroupedAssignments.some((t) => t.id === startedAssignmentId)) {
      setStartedAssignmentId(null);
    }
  }, [allGroupedAssignments, startedAssignmentId]);

  React.useEffect(() => {
    if (!startedAssignmentId) return;
    setLastScanResult({ status: "idle" });
    focusScanInput();
  }, [startedAssignmentId, focusScanInput]);

  const startAssignment = async (assignment: PackingAssignment) => {
    const w = normalizeWorkflowStatus(assignment.workflowStatus);
    const saRaw = assignment.shipments ?? [];
    const saList = Array.isArray(saRaw) ? saRaw : [];
    const saPackOk = outboundShipmentsPackedQtyPlanSatisfied(saList);
    if (w === "cancelled") {
      toast.info("Отгрузка отменена");
      return;
    }
    if (saList.some((sh) => isOutboundShipmentRowCancelled(sh))) {
      toast.info("Отгрузка отменена");
      return;
    }
    if (saList.some((sh) => isOutboundShipmentRowTerminal(sh))) {
      toast.info("Отгрузка уже завершена");
      return;
    }
    if (w === "shipped" || w === "shipped_with_diff") {
      toast.info("Отгрузка уже завершена");
      return;
    }
    if ((w === "completed" || w === "assembled") && saPackOk) return;
    if (assignment.workflowStatus === "pending") {
      for (const sh of assignment.shipments) {
        await updateOutboundDraft({ id: sh.id, patch: { workflowStatus: "processing", status: "к отгрузке" } });
      }
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
      const firstSh = assignment.shipments[0];
      const noStart = firstSh?.assignmentNo?.trim() || firstSh?.assignmentId?.trim() || firstSh?.id || "—";
      const leNameStart = legal?.find((x) => x.id === assignment.legalEntityId)?.shortName ?? assignment.legalEntityId;
      appendOperationLog({
        type: "PACKING_STARTED",
        legalEntityId: assignment.legalEntityId,
        legalEntityName: leNameStart,
        taskId: assignment.id,
        taskNumber: noStart,
        description: `Задание №${noStart} взято в работу`,
      });
    }
    setStartedAssignmentId(assignment.id);
  };

  const startAssignmentRef = React.useRef(startAssignment);
  startAssignmentRef.current = startAssignment;
  const consumedOpenAssignmentRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const openId = searchParams.get("openAssignment");
    if (!openId) {
      consumedOpenAssignmentRef.current = null;
      return;
    }
    if (isLoading || error) return;
    const assignment = allGroupedAssignments.find((a) => a.id === openId);
    if (!assignment) return;
    if (consumedOpenAssignmentRef.current === openId) return;
    consumedOpenAssignmentRef.current = openId;
    void (async () => {
      await startAssignmentRef.current(assignment);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("openAssignment");
          return n;
        },
        { replace: true },
      );
    })();
  }, [searchParams, allGroupedAssignments, isLoading, error, setSearchParams]);

  const packingReadOnlyShippedOut =
    startedAssignment != null &&
    startedShipmentList.length > 0 &&
    startedShipmentList.every((sh) => isOutboundShipmentRowClosedForPacking(sh));
  const packingReadOnlyDueToCancellation =
    packingReadOnlyShippedOut &&
    startedShipmentList.some((sh) => isOutboundShipmentRowCancelled(sh));
  const startedShipmentDiffReason = React.useMemo(() => {
    const raw = startedShipmentList
      .map((s) => String((s as OutboundShipment & { differenceReason?: string }).differenceReason ?? "").trim())
      .find(Boolean);
    return raw || null;
  }, [startedShipmentList]);
  const startedShippedAtLabel = React.useMemo(() => {
    if (!startedShipmentList.length) return null as string | null;
    const maxTs = startedShipmentList.reduce((m, sh) => {
      const t = String(sh.shippedAt ?? "").trim();
      if (t && t > m) return t;
      return m;
    }, "");
    return maxTs ? formatTaskArchiveDateLabel(maxTs) : null;
  }, [startedShipmentList]);

  const startedFirst = startedShipmentList[0] ?? null;
  const startedAssignmentNo =
    startedFirst?.assignmentNo?.trim() || startedFirst?.assignmentId?.trim() || startedFirst?.id || "—";
  const startedLegalName = startedAssignment
    ? legal?.find((x) => x.id === startedAssignment.legalEntityId)?.shortName ?? startedAssignment.legalEntityId
    : "—";
  const startedCreatedLabel = startedFirst?.createdAt
    ? format(parseISO(startedFirst.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })
    : "—";
  const startedWarehouse = startedFirst?.sourceWarehouse ?? "—";
  const startedStatus =
    startedAssignment && startedShipmentList.length > 0
      ? workflowFromOutboundGroup(startedShipmentList)
      : ("pending" as TaskWorkflowStatus);

  return (
    <div
      className={`space-y-4 transition-colors duration-150 ${
        flashState === "ok" ? "bg-emerald-100/80" : flashState === "error" ? "bg-rose-100/80" : ""
      }`}
    >
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Рабочее место упаковщика</h2>
        <p className="mt-1 text-sm text-slate-600">Изолированный модуль физической упаковки и сканирования отгрузок.</p>
      </div>
      {!startedAssignment ? (
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: №, юрлицо, артикул, баркод" className="w-[300px]" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | TaskWorkflowStatus)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">Новое</SelectItem>
              <SelectItem value="processing">В работе</SelectItem>
              <SelectItem value="assembling">В сборке</SelectItem>
              <SelectItem value="assembled">Собрано</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
              <SelectItem value="shipped">Отгружено</SelectItem>
              <SelectItem value="shipped_with_diff">Отгружено с расхождением</SelectItem>
              <SelectItem value="cancelled">Отменена</SelectItem>
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Склад" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {warehouses.map((wh) => <SelectItem key={wh} value={wh}>{wh}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mpFilter} onValueChange={(v) => setMpFilter(v as typeof mpFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все МП</SelectItem>
              <SelectItem value="wb">WB</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
      ) : null}

      <GlobalFiltersBar />

      {!startedAssignment ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Очередь заданий на отгрузку</CardTitle>
            <CardDescription>
              {viewMode === "archive"
                ? "Архив завершённых заданий. «Открыть» — просмотр состава без сканирования."
                : "Выберите документ и нажмите «Взять в работу»."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">Не удалось загрузить список отгрузок.</p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-slate-600">
                {viewMode === "active" ? "Активных заданий нет." : "Архив упаковки пуст."}
              </p>
            ) : (
              <TaskRegistryTable
                archiveMode={viewMode === "archive"}
                disableActionForCompleted={viewMode !== "archive"}
                showPackingPriority
                rows={assignments.map((assignment) => {
                  const first = assignment.shipments[0];
                  const assignmentNo = first?.assignmentNo?.trim() || first?.assignmentId?.trim() || first?.id || "—";
                  const legalName = legal?.find((x) => x.id === assignment.legalEntityId)?.shortName ?? assignment.legalEntityId;
                  const createdIso = assignment.shipments.reduce(
                    (max, sh) => ((sh.createdAt || "") > (max || "") ? sh.createdAt : max),
                    first?.createdAt ?? "",
                  );
                  const dateLabel = formatTaskArchiveDateLabel(createdIso);
                  const completedLabel = formatTaskArchiveDateLabel(outboundShipmentsCompletedAtIso(assignment.shipments));
                  const totalPlan = assignment.shipments.reduce((sum, sh) => sum + (Number(sh.plannedUnits) || 0), 0);
                  const shipmentsReg = Array.isArray(assignment.shipments) ? assignment.shipments : [];
                  const totalFact = shipmentsReg.reduce((sum, sh) => sum + outboundPackedQtyDisplay(sh), 0);
                  const wf = normalizeWorkflowStatus(assignment.workflowStatus);
                  const overrun = Math.max(0, totalFact - totalPlan);
                  const requiresReview = totalPlan > 0 && totalPlan !== totalFact;
                  const mismatch =
                    (wf === "completed" || wf === "assembled") &&
                    (totalPlan !== totalFact || assignment.shipments.some((s) => Boolean(s.completedWithDiscrepancies)));
                  return {
                    id: assignment.id,
                    createdAtLabel: dateLabel,
                    completedAtLabel: completedLabel,
                    taskNo: assignmentNo,
                    legalEntityLabel: legalName,
                    priority: assignment.priority,
                    status: wf,
                    warehouseLabel: first?.sourceWarehouse ?? "—",
                    marketplaceLabel: first?.marketplace?.toUpperCase() ?? "—",
                    plan: totalPlan,
                    fact: totalFact,
                    isNew: wf === "pending",
                    requiresReview,
                    mismatch,
                    overrun,
                  };
                })}
                onOpen={(id) => {
                  if (viewMode === "archive") {
                    setPackingArchivePeekId((p) => (p === id ? null : id));
                    return;
                  }
                  const assignment = assignments.find((x) => x.id === id);
                  if (!assignment) return;
                  void startAssignment(assignment);
                }}
                onAction={(id) => {
                  if (viewMode === "archive") {
                    setPackingArchivePeekId((p) => (p === id ? null : id));
                    return;
                  }
                  const assignment = assignments.find((x) => x.id === id);
                  if (!assignment) return;
                  void startAssignment(assignment);
                }}
              />
            )}
            {viewMode === "archive" && packingArchivePeekAssignment ? (
              <Card className="mt-3 border-slate-200 bg-slate-50/50 shadow-sm">
                <CardHeader className="border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Состав задания (архив)</CardTitle>
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setPackingArchivePeekId(null)}>
                      Закрыть
                    </Button>
                  </div>
                  <CardDescription className="text-slate-600">Только просмотр</CardDescription>
                </CardHeader>
                <CardContent className="p-3">
                  {packingArchivePeekRows.length === 0 ? (
                    <p className="text-sm text-slate-600">Нет строк</p>
                  ) : (
                    <TaskItemsTable variant="outboundLines" rows={packingArchivePeekRows} />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {startedAssignment ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Рабочий экран задания</CardTitle>
            <CardDescription>Сканирование и сборка выбранного задания</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-5">
              <div><span className="text-slate-500">№ задания:</span><div className="font-medium text-slate-900">{startedAssignmentNo}</div></div>
              <div><span className="text-slate-500">Юрлицо:</span><div className="font-medium text-slate-900">{startedLegalName}</div></div>
              <div><span className="text-slate-500">Склад:</span><div className="font-medium text-slate-900">{startedWarehouse}</div></div>
              <div>
                <span className="text-slate-500">Статус:</span>
                <div className="mt-0.5">
                  <StatusBadge status={startedStatus} requiresReview={taskNeedsReview} />
                </div>
              </div>
              <div><span className="text-slate-500">Дата создания:</span><div className="font-medium text-slate-900">{startedCreatedLabel}</div></div>
            </div>
            {packingReadOnlyShippedOut ? (
              packingReadOnlyDueToCancellation ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900">
                  <p className="font-medium">Отгрузка отменена. Упаковка недоступна.</p>
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">Отгрузка уже завершена. Упаковка недоступна.</p>
                  {startedShippedAtLabel ? (
                    <p className="text-xs tabular-nums text-amber-900/90">Дата отгрузки: {startedShippedAtLabel}</p>
                  ) : null}
                  {startedShipmentDiffReason ? (
                    <p className="text-xs text-amber-900/90">Причина расхождения: {startedShipmentDiffReason}</p>
                  ) : null}
                </div>
              )
            ) : null}
            {!packingReadOnlyShippedOut ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Input
                ref={scanInputRef}
                placeholder="Сканируйте или введите штрихкод"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                className={cn(
                  "h-16 min-w-0 flex-1 border-2 border-slate-300 bg-white text-xl shadow-sm transition-[box-shadow,border-color] md:text-2xl",
                  "placeholder:text-slate-400",
                  "focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyScan();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="h-16 shrink-0 rounded-lg bg-blue-600 px-6 text-base font-semibold text-white shadow-none hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void applyScan()}
                disabled={!scanValue.trim() || isSubmittingScan || isUpdatingOutboundDraft}
              >
                {isSubmittingScan || isUpdatingOutboundDraft ? "Обработка..." : "Пикнуть"}
              </Button>
            </div>
            ) : null}

            {!packingReadOnlyShippedOut ? (
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                lastScanResult.status === "idle" && "border-slate-200 bg-slate-50 text-slate-600",
                lastScanResult.status === "success" && "border-emerald-200 bg-emerald-50/90 text-emerald-900",
                lastScanResult.status === "error" && "border-red-200 bg-red-50/90 text-red-800",
              )}
              aria-live="polite"
            >
              {lastScanResult.status === "idle" ? (
                <p className="font-medium">Ожидание сканирования…</p>
              ) : lastScanResult.status === "success" ? (
                <div>
                  <p className="font-semibold text-emerald-800">{lastScanResult.title}</p>
                  {lastScanResult.hint ? <p className="mt-0.5 line-clamp-2 text-emerald-900/90">{lastScanResult.hint}</p> : null}
                </div>
              ) : (
                <p className="font-semibold">{lastScanResult.message}</p>
              )}
            </div>
            ) : null}

            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  План {progress.totalPlan} · Упаковано {progress.totalPacked} · Подобрано {progress.totalPicked}
                  · К упаковке из подбора {progress.remainingPack}
                  ·{" "}
                  {progress.remaining === 0 ? (
                    <span className="font-semibold text-emerald-600">Готово</span>
                  ) : (
                    <span className="font-semibold text-amber-600">До плана {progress.remaining}</span>
                  )}
                  {progress.overrun > 0 ? (
                    <span className="text-slate-700">{` · Перерасход ${progress.overrun}`}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    progress.remaining === 0 ? "font-semibold text-emerald-600" : "text-slate-600",
                  )}
                >
                  {progress.percent}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    progress.percent >= 100 ? "bg-emerald-600" : "bg-slate-500",
                  )}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Название</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Артикул</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Баркод</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">МП</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Цвет</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Размер</th>
                    <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">План</th>
                    <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Подобр.</th>
                    <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Упак.</th>
                    <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Осталось</th>
                    <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Перерасход</th>
                    <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Расхождение</th>
                    <th className="border-b px-2 py-1.5 text-left text-xs font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {scanLines.map((line) => {
                    const rem = planFactRemaining(line.plan, line.packed);
                    const over = planFactOverrun(line.plan, line.packed);
                    const disc = planFactDiscrepancyText(line.plan, line.packed);
                    const rowBg = planFactRowBgClass(line.plan, line.packed);
                    const flashRow =
                      highlightedLineKey === line.key && lineHighlightTone === "success"
                        ? "bg-emerald-100 ring-2 ring-inset ring-emerald-400/90"
                        : highlightedLineKey === line.key && lineHighlightTone === "error"
                          ? "bg-rose-100 ring-2 ring-inset ring-rose-400/90"
                          : "";
                    return (
                    <tr key={line.key} className={cn("odd:bg-white even:bg-slate-50/50 transition-colors duration-150", rowBg, flashRow)}>
                      <td className="border-b border-r px-2 py-1.5 text-xs">{line.name || "—"}</td>
                      <td className="border-b border-r px-2 py-1.5 text-xs">{line.article || "—"}</td>
                      <td className="border-b border-r px-2 py-1.5 font-mono text-[11px]">{line.barcode || "—"}</td>
                      <td className="border-b border-r px-2 py-1.5 text-xs">{line.marketplace.toUpperCase()}</td>
                      <td className="border-b border-r px-2 py-1.5 text-xs">{line.color || "—"}</td>
                      <td className="border-b border-r px-2 py-1.5 text-xs">{line.size || "—"}</td>
                      <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-xs">{line.plan}</td>
                      <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-xs">{line.picked}</td>
                      <td className="border-b border-r px-2 py-1.5 text-right align-top tabular-nums text-xs">
                        <div>{line.packed}</div>
                        {line.picked > 0 ? (
                          line.packed < line.picked ? (
                            <div className="text-[10px] font-medium text-amber-800">не завершена</div>
                          ) : (
                            <div className="text-[10px] font-medium text-emerald-700">полностью</div>
                          )
                        ) : null}
                      </td>
                      <td className={`border-b border-r px-2 py-1.5 text-right tabular-nums text-xs ${rem > 0 ? "font-medium text-amber-800" : ""}`}>
                        {rem}
                      </td>
                      <td className={`border-b border-r px-2 py-1.5 text-right tabular-nums text-xs ${over > 0 ? "font-medium text-red-700" : ""}`}>
                        {over}
                      </td>
                      <td className="border-b border-r px-2 py-1.5 text-xs text-slate-700">{disc ?? "—"}</td>
                      <td className="border-b px-2 py-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${planFactLineBadgeClass(line.plan, line.packed)}`}>
                          {planFactLineStatusLabel(line.plan, line.packed)}
                        </span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {!packingReadOnlyShippedOut ? (
            <div className="space-y-2">
              <div className="flex max-w-sm flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full shrink-0 rounded-lg bg-emerald-600 font-semibold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
                  onClick={() => void finalizeAssignment()}
                  disabled={
                    isUpdatingOutboundDraft ||
                    isUpdatingOutbound ||
                    progress.totalPlan === 0 ||
                    !finalizePackPlanOk
                  }
                >
                  Завершить задание
                </Button>
                {!finalizePackPlanOk ? (
                  <p className="text-xs font-medium leading-snug text-amber-800 sm:pt-2">
                    Нельзя завершить: упакованы не все товары
                  </p>
                ) : null}
                {finalizePackPlanOk && finalizePlanFactWarning ? (
                  <p className="text-xs font-medium leading-snug text-amber-800 sm:pt-2">{finalizePlanFactWarning}</p>
                ) : null}
              </div>
              {finalizePackPlanOk && !finalizePlanFactWarning && taskNeedsReview ? (
                <p className="text-xs font-medium text-amber-800">
                  Есть расхождения план/упаковано. Завершение доступно с предупреждением; при отсутствии подбора со склада создаётся движение по min(план, упаковано).
                </p>
              ) : finalizePackPlanOk && !finalizePlanFactWarning && progress.totalPacked < progress.totalPlan ? (
                <p className="text-xs text-slate-600">
                  До плана по упаковке: {progress.remaining} шт. · Отсканировать из подбора: {progress.remainingPack} шт.
                </p>
              ) : null}
            </div>
            ) : null}
            <Button variant="outline" className="h-10 w-full max-w-sm" onClick={() => setStartedAssignmentId(null)}>
              Назад к списку
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default PackingPage;
