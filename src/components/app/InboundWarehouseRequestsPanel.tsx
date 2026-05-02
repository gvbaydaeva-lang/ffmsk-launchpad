import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryMovements, useLegalEntities, useLocations, useProductCatalog, useWarehouseInboundRequests } from "@/hooks/useWmsMock";
import type { InboundWarehouseReceivingMode, InboundWarehouseItem, InboundWarehouseRequest, InventoryMovement, ProductCatalogItem } from "@/types/domain";
import type { InboundPlacementInput } from "@/services/warehouseInboundApi";
import WarehouseImportPreviewPanel from "@/components/app/WarehouseImportPreviewPanel";
import {
  WarehouseImportExcelDescription,
  WAREHOUSE_IMPORT_BTN_CHECK,
  WAREHOUSE_IMPORT_TEXTAREA_PLACEHOLDER,
} from "@/components/app/WarehouseImportExcelDescription";
import { inboundImportFileToPasteText } from "@/lib/inboundWarehouseFileImport";
import { makeInventoryBalanceKey } from "@/lib/inventoryBalanceKey";
import { movementLocationTotalsForWarehouseBalanceKey } from "@/services/mockInventoryMovements";
import { downloadWarehouseImportTemplateXlsx } from "@/lib/warehouseImportTemplateXlsx";
import {
  inspectWarehouseImportPaste,
  mergeInboundImportDraftLines,
  warehouseImportInspectionFromMessage,
} from "@/lib/warehouseImportPaste";
import type { WarehouseImportInspectionResult } from "@/lib/warehouseImportPaste";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WmsTableRowActions } from "@/components/app/WmsTableRowActions";

type DraftLine = { key: string; productId: string; plannedQty: string };

function formatPlannedDate(value: string): string {
  const t = Date.parse(`${value}T12:00:00`);
  if (!Number.isFinite(t)) return value || "—";
  return format(new Date(t), "dd.MM.yyyy", { locale: ru });
}

function receivingModeLabel(mode: InboundWarehouseReceivingMode): string {
  return mode === "manual" ? "Ручной ввод" : "Сканирование";
}

function statusLabel(row: InboundWarehouseRequest): string {
  if (row.status === "cancelled") return "Отменена";
  if (row.status === "placed") return "Размещено";
  if (row.status === "received") return "Принято";
  if (row.status === "receiving") return "Приёмка";
  return "Новая";
}

type InboundProductLine = { name: string; article: string; barcode: string };

function InboundProductLineCell({ name, article, barcode }: InboundProductLine) {
  const title = (name || "").trim() || "—";
  const art = (article || "").trim() || "—";
  const bc = (barcode || "").trim() || "—";
  return (
    <div className="min-w-0 max-w-[320px]">
      <div className="font-medium leading-snug text-slate-900">{title}</div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Артикул: <span className="font-mono">{art}</span> · Штрихкод: <span className="font-mono">{bc}</span>
      </p>
    </div>
  );
}

function sumPlacementsQty(item: InboundWarehouseItem): number {
  return item.placements.reduce((s, p) => s + Math.max(0, Math.trunc(Number(p.qty) || 0)), 0);
}

/** Совпадает с `warehouseName` в движениях приёмки/размещения в `warehouseInboundApi`. */
const INBOUND_STOCK_WAREHOUSE_NAME = "Зона приёмки";

function recommendedStorageLocationForPlacement(
  movements: InventoryMovement[],
  storageLocations: { id: string; name: string }[],
  product: ProductCatalogItem | undefined,
  partnerId: string,
): { id: string; name: string } | null {
  if (!storageLocations.length) return null;
  const key = makeInventoryBalanceKey({
    legalEntityId: partnerId,
    warehouseName: INBOUND_STOCK_WAREHOUSE_NAME,
    barcode: (product?.barcode ?? "").trim() || "—",
    article: (product?.supplierArticle ?? "").trim() || "—",
    color: (product?.color ?? "").trim() || "—",
    size: (product?.size ?? "").trim() || "—",
  });
  const byLoc = movementLocationTotalsForWarehouseBalanceKey(movements, INBOUND_STOCK_WAREHOUSE_NAME, key);
  let bestWithStock: { id: string; name: string; qty: number } | null = null;
  for (const loc of storageLocations) {
    const qty = Math.max(0, Math.trunc(byLoc.get(loc.id) ?? 0));
    if (qty <= 0) continue;
    if (!bestWithStock || qty > bestWithStock.qty) {
      bestWithStock = { id: loc.id, name: loc.name, qty };
    }
  }
  if (bestWithStock) return { id: bestWithStock.id, name: bestWithStock.name };
  return { id: storageLocations[0].id, name: storageLocations[0].name };
}

function isInboundPlacementFullyDistributed(row: InboundWarehouseRequest): boolean {
  return row.items.every((it) => {
    const rq = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    return sumPlacementsQty(it) === rq;
  });
}

function InboundLinePlacementsBlock({
  item,
  productLine,
  readOnly,
  storageLocations,
  locationName,
  onPersist,
  persistBusy,
  flowLocked,
  partnerId,
  inventoryMovements,
  catalogItems,
}: {
  item: InboundWarehouseItem;
  productLine: InboundProductLine;
  readOnly: boolean;
  storageLocations: { id: string; name: string }[];
  locationName: (id: string) => string;
  onPersist: (pl: InboundPlacementInput[]) => Promise<void>;
  persistBusy: boolean;
  /** Глобальная блокировка панели (завершение приёмки/размещения и др.) */
  flowLocked?: boolean;
  partnerId: string;
  inventoryMovements: InventoryMovement[];
  catalogItems: ProductCatalogItem[];
}) {
  type DraftPl = { rowKey: string; id: string; locationId: string; qty: string };
  const [lines, setLines] = React.useState<DraftPl[]>([]);
  React.useEffect(() => {
    setLines(
      item.placements.map((p, i) => ({
        rowKey: p.id || `k-${i}`,
        id: p.id,
        locationId: p.locationId,
        qty: String(Math.max(1, Math.trunc(Number(p.qty) || 0))),
      })),
    );
  }, [item.placements, item.id]);

  const receivedQty = Math.max(0, Math.trunc(Number(item.receivedQty) || 0));
  const distributed = sumPlacementsQty(item);

  const applyLines = async () => {
    const payload: InboundPlacementInput[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const ln = lines[i];
      const loc = (ln.locationId || "").trim();
      const q = Math.trunc(Number(ln.qty) || 0);
      if (!loc && q <= 0) continue;
      if (!loc) {
        toast.error(`Строка ${i + 1}: выберите ячейку`);
        return;
      }
      if (!Number.isFinite(q) || q < 1) {
        toast.error(`Строка ${i + 1}: укажите количество > 0`);
        return;
      }
      const idTrim = (ln.id || "").trim();
      payload.push({
        ...(idTrim ? { id: idTrim } : {}),
        locationId: loc,
        qty: q,
      });
    }
    const sumDraft = payload.reduce((s, p) => s + p.qty, 0);
    if (sumDraft > receivedQty) {
      toast.error("Сумма по строкам размещения не может превышать принятое количество");
      return;
    }
    await onPersist(payload);
  };

  const locked = Boolean(flowLocked || persistBusy);

  const productForKey = React.useMemo(
    () => catalogItems.find((p) => p.id === item.productId),
    [catalogItems, item.productId],
  );
  const recommendedLocation = React.useMemo(
    () => recommendedStorageLocationForPlacement(inventoryMovements, storageLocations, productForKey, partnerId),
    [inventoryMovements, storageLocations, productForKey, partnerId],
  );

  if (readOnly) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <InboundProductLineCell {...productLine} />
          <span className="text-xs tabular-nums text-slate-600">
            Принято: {receivedQty} · Распределено: {distributed}
          </span>
        </div>
        {receivedQty <= 0 ? (
          <p className="text-xs text-slate-500">Нет принятого количества.</p>
        ) : item.placements.length === 0 ? (
          <p className="text-xs text-slate-500">—</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-700">
            {item.placements.map((p) => (
              <li key={p.id} className="tabular-nums">
                {locationName(p.locationId)} · {p.qty} шт.
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (receivedQty <= 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <InboundProductLineCell {...productLine} />
        <p className="mt-1 text-xs text-slate-500">Нет принятого количества — размещение не требуется.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <InboundProductLineCell {...productLine} />
        <span className="text-xs tabular-nums text-slate-600">
          Принято: {receivedQty} · Распределено: {distributed} / {receivedQty}
        </span>
      </div>
      {recommendedLocation && storageLocations.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-100 bg-sky-50/80 px-2 py-1.5">
          <div className="min-w-0 text-xs leading-snug text-sky-950">
            <span className="font-semibold text-sky-900">Рекомендуемая ячейка.</span>{" "}
            <span>Рекомендуем: {recommendedLocation.name}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs"
            disabled={locked}
            onClick={() => {
              const rid = recommendedLocation.id;
              setLines((prev) => {
                const emptyIdx = prev.findIndex((x) => !(x.locationId || "").trim());
                if (emptyIdx >= 0) {
                  return prev.map((x, i) => (i === emptyIdx ? { ...x, locationId: rid } : x));
                }
                if (prev.length === 0) return prev;
                return prev.map((x, i) => (i === 0 ? { ...x, locationId: rid } : x));
              });
            }}
          >
            Выбрать
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {lines.map((ln) => (
          <div key={ln.rowKey} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs text-slate-500">Ячейка</Label>
              <Select
                value={ln.locationId || undefined}
                disabled={locked}
                onValueChange={(v) =>
                  setLines((prev) => prev.map((x) => (x.rowKey === ln.rowKey ? { ...x, locationId: v } : x)))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {storageLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[100px]">
              <Label className="text-xs text-slate-500">Кол-во</Label>
              <Input
                type="number"
                min={1}
                step={1}
                className="h-9 tabular-nums"
                value={ln.qty}
                disabled={locked}
                onChange={(e) =>
                  setLines((prev) => prev.map((x) => (x.rowKey === ln.rowKey ? { ...x, qty: e.target.value } : x)))
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 text-slate-600"
              onClick={() => setLines((prev) => prev.filter((x) => x.rowKey !== ln.rowKey))}
              disabled={locked}
            >
              Убрать
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={locked}
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { rowKey: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, id: "", locationId: "", qty: "1" },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Размещение
          </Button>
          <Button type="button" size="sm" className="h-8" disabled={locked} onClick={() => void applyLines()}>
            {persistBusy ? "Сохранение…" : "Сохранить распределение"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboundReceivingQtyRow({
  item,
  productLine,
  onSave,
  disabled,
  editable = true,
}: {
  item: InboundWarehouseItem;
  productLine: InboundProductLine;
  onSave: (qty: number) => Promise<void>;
  disabled?: boolean;
  editable?: boolean;
}) {
  const [val, setVal] = React.useState(String(item.receivedQty));
  React.useEffect(() => {
    setVal(String(item.receivedQty));
  }, [item.receivedQty, item.id]);

  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    },
    [],
  );

  const persist = async (raw: string) => {
    const n = Math.max(0, Math.trunc(Number(raw) || 0));
    if (n === item.receivedQty) return;
    await onSave(n);
  };

  return (
    <TableRow>
      <TableCell className="align-top text-sm">
        <InboundProductLineCell {...productLine} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">{item.plannedQty}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{item.receivedQty}</TableCell>
      <TableCell className="w-[140px]">
        {editable ? (
          <Input
            type="number"
            min={0}
            step={1}
            className="h-9 tabular-nums"
            value={val}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setVal(next);
              if (tRef.current) window.clearTimeout(tRef.current);
              tRef.current = window.setTimeout(() => {
                void persist(next);
              }, 450);
            }}
            onBlur={() => {
              if (tRef.current) {
                window.clearTimeout(tRef.current);
                tRef.current = null;
              }
              const n = Math.max(0, Math.trunc(Number(val) || 0));
              setVal(String(n));
              if (n !== item.receivedQty) void persist(String(n));
            }}
          />
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums text-slate-600">
        {item.receivedQty} / {item.plannedQty}
      </TableCell>
    </TableRow>
  );
}

const InboundWarehouseRequestsPanel = () => {
  const { data: entities } = useLegalEntities();
  const { data: catalog, isLoading: catalogLoading } = useProductCatalog();
  const { data: locationsData } = useLocations();
  const { data: inventoryMovementsRaw } = useInventoryMovements();
  const inventoryMovementsSafe = React.useMemo(
    () => (Array.isArray(inventoryMovementsRaw) ? inventoryMovementsRaw : []),
    [inventoryMovementsRaw],
  );
  const {
    data: inboundList,
    isLoading: listLoading,
    error: listError,
    postInbounds,
    isPostingInbounds,
    startInboundReceiving,
    isStartingInboundReceiving,
    startingInboundReceivingVars,
    updateInboundReceivedQty,
    isUpdatingInboundReceivedQty,
    updatingInboundReceivedVars,
    completeWarehouseInboundReceiving,
    isCompletingWarehouseInboundReceiving,
    completingWarehouseInboundId,
    updateWarehouseInboundPlacement,
    isUpdatingWarehouseInboundPlacement,
    updatingWarehouseInboundPlacementVars,
    completeWarehouseInboundPlacement,
    isCompletingWarehouseInboundPlacement,
    completingWarehouseInboundPlacementId,
    cancelWarehouseInbound,
    isCancellingWarehouseInbound,
    cancellingWarehouseInboundId,
  } = useWarehouseInboundRequests();

  const [modeDialogInboundId, setModeDialogInboundId] = React.useState<string | null>(null);

  const [partnerId, setPartnerId] = React.useState("");
  const [plannedDate, setPlannedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>(() => [{ key: `l-${Date.now()}`, productId: "", plannedQty: "" }]);
  const [inboundPasteOpen, setInboundPasteOpen] = React.useState(false);
  const [inboundPasteText, setInboundPasteText] = React.useState("");
  const inboundFileInputRef = React.useRef<HTMLInputElement>(null);
  const inboundApplyImportLockedRef = React.useRef(false);
  const [inboundImportPreview, setInboundImportPreview] = React.useState<WarehouseImportInspectionResult | null>(null);
  const [expandedInboundIds, setExpandedInboundIds] = React.useState<Set<string>>(() => new Set());

  const toggleInboundRowExpansion = React.useCallback((id: string) => {
    setExpandedInboundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollInboundPlacementIntoView = React.useCallback((inboundId: string) => {
    const el = document.getElementById(`inbound-placement-${inboundId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  /** Раскрыть заявку и прокрутить к блоку размещения (для статуса «Принято»). */
  const expandInboundRowAndScrollToPlacement = React.useCallback((inboundId: string) => {
    setExpandedInboundIds((prev) => {
      const next = new Set(prev);
      next.add(inboundId);
      return next;
    });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => scrollInboundPlacementIntoView(inboundId), 120);
    });
  }, [scrollInboundPlacementIntoView]);

  React.useEffect(() => {
    setInboundImportPreview(null);
  }, [partnerId]);

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const productNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of catalog ?? []) {
      m.set(p.id, (p.name ?? "").trim() || p.supplierArticle || p.id);
    }
    return m;
  }, [catalog]);

  const productLinesById = React.useMemo(() => {
    const m = new Map<string, InboundProductLine>();
    for (const p of catalog ?? []) {
      m.set(p.id, {
        name: (p.name ?? "").trim() || (p.supplierArticle ?? "").trim() || p.id,
        article: (p.supplierArticle ?? "").trim(),
        barcode: (p.barcode ?? "").trim(),
      });
    }
    return m;
  }, [catalog]);

  const receivingUiLineForProductId = React.useCallback(
    (productId: string): InboundProductLine =>
      productLinesById.get(productId) ?? {
        name: productNameById.get(productId) ?? productId,
        article: "",
        barcode: "",
      },
    [productLinesById, productNameById],
  );

  /** Один связанный id продолжения на исходную заявку (идемпотентное создание в API). */
  const continuationInboundIdByOrigin = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of inboundList ?? []) {
      const oid = (r.originInboundId ?? "").trim();
      if (oid) m.set(oid, r.id);
    }
    return m;
  }, [inboundList]);

  const storageLocations = React.useMemo(() => {
    const list = Array.isArray(locationsData) ? locationsData : [];
    return list.filter((l) => l?.type === "storage").map((l) => ({ id: l.id, name: l.name || l.id }));
  }, [locationsData]);

  const locationNameById = React.useCallback(
    (id: string) => {
      const list = Array.isArray(locationsData) ? locationsData : [];
      const hit = list.find((l) => l.id === id);
      return hit?.name ?? id;
    },
    [locationsData],
  );

  const persistReceivedQty = React.useCallback(
    async (inboundId: string, itemId: string, receivedQty: number) => {
      try {
        await updateInboundReceivedQty({ inboundId, itemId, receivedQty });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось сохранить факт";
        toast.error(msg);
      }
    },
    [updateInboundReceivedQty],
  );

  const lineReceivedQtyBusy = React.useCallback(
    (inboundId: string, itemId: string) =>
      Boolean(
        isUpdatingInboundReceivedQty &&
          updatingInboundReceivedVars?.inboundId === inboundId &&
          updatingInboundReceivedVars?.itemId === itemId,
      ),
    [isUpdatingInboundReceivedQty, updatingInboundReceivedVars],
  );

  const productsForPartner = React.useMemo(() => {
    const all = Array.isArray(catalog) ? catalog : [];
    if (!partnerId.trim()) return all;
    const filtered = all.filter((p) => p.legalEntityId === partnerId);
    return filtered.length > 0 ? filtered : all;
  }, [catalog, partnerId]);

  const resetForm = React.useCallback(() => {
    setPartnerId("");
    setPlannedDate(new Date().toISOString().slice(0, 10));
    setComment("");
    setInboundPasteOpen(false);
    setInboundPasteText("");
    setInboundImportPreview(null);
    setLines([{ key: `l-${Date.now()}`, productId: "", plannedQty: "" }]);
  }, []);

  const addLine = () => {
    setLines((prev) => [...prev, { key: `l-${Date.now()}-${prev.length}`, productId: "", plannedQty: "" }]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<Pick<DraftLine, "productId" | "plannedQty">>) => {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const submit = async () => {
    const items = lines
      .map((l) => ({
        productId: l.productId.trim(),
        plannedQty: Math.trunc(Number(l.plannedQty) || 0),
      }))
      .filter((l) => l.productId && l.plannedQty > 0);

    try {
      await postInbounds({
        partnerId,
        plannedDate,
        comment,
        items,
      });
      toast.success("Заявка на приёмку создана");
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось создать заявку";
      toast.error(msg);
    }
  };

  const confirmStartReceiving = async (mode: InboundWarehouseReceivingMode) => {
    const id = modeDialogInboundId;
    if (!id) return;
    try {
      await startInboundReceiving({ id, mode });
      toast.success(`Приёмка начата (${receivingModeLabel(mode)})`);
      setModeDialogInboundId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось начать приёмку";
      toast.error(msg);
    }
  };

  /** Любая исходящая мутация по конкретной заявке — отмена для неё недоступна. */
  const inboundRowMutationPending = React.useCallback(
    (rowId: string) =>
      Boolean(
        (isStartingInboundReceiving && startingInboundReceivingVars?.id === rowId) ||
          (isCancellingWarehouseInbound && cancellingWarehouseInboundId === rowId) ||
          (isUpdatingInboundReceivedQty && updatingInboundReceivedVars?.inboundId === rowId) ||
          (isCompletingWarehouseInboundReceiving && completingWarehouseInboundId === rowId) ||
          (isUpdatingWarehouseInboundPlacement && updatingWarehouseInboundPlacementVars?.inboundId === rowId) ||
          (isCompletingWarehouseInboundPlacement && completingWarehouseInboundPlacementId === rowId),
      ),
    [
      isStartingInboundReceiving,
      startingInboundReceivingVars?.id,
      isCancellingWarehouseInbound,
      cancellingWarehouseInboundId,
      isUpdatingInboundReceivedQty,
      updatingInboundReceivedVars?.inboundId,
      isCompletingWarehouseInboundReceiving,
      completingWarehouseInboundId,
      isUpdatingWarehouseInboundPlacement,
      updatingWarehouseInboundPlacementVars?.inboundId,
      isCompletingWarehouseInboundPlacement,
      completingWarehouseInboundPlacementId,
    ],
  );

  const cancelInboundFor = React.useCallback(
    async (inboundId: string) => {
      try {
        await cancelWarehouseInbound(inboundId);
        toast.success("Приёмка отменена");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось отменить приёмку";
        toast.error(msg);
      }
    },
    [cancelWarehouseInbound],
  );

  const rowReceivingBusy = (rowId: string) =>
    isStartingInboundReceiving && startingInboundReceivingVars?.id === rowId;

  const completeReceivingBusy = (rowId: string) =>
    Boolean(isCompletingWarehouseInboundReceiving && completingWarehouseInboundId === rowId);

  const completeInboundReceivingFor = React.useCallback(
    async (inboundId: string) => {
      try {
        await completeWarehouseInboundReceiving(inboundId);
        toast.success("Приёмка завершена, движения приёмки учтены");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось завершить приёмку";
        toast.error(msg);
      }
    },
    [completeWarehouseInboundReceiving],
  );

  const persistPlacementForLine = React.useCallback(
    async (inboundId: string, itemId: string, placements: InboundPlacementInput[]) => {
      try {
        await updateWarehouseInboundPlacement({ inboundId, itemId, placements });
        toast.success("Распределение сохранено");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось сохранить размещение";
        toast.error(msg);
      }
    },
    [updateWarehouseInboundPlacement],
  );

  const placementLineBusy = React.useCallback(
    (inboundId: string, itemId: string) =>
      Boolean(
        isUpdatingWarehouseInboundPlacement &&
          updatingWarehouseInboundPlacementVars?.inboundId === inboundId &&
          updatingWarehouseInboundPlacementVars?.itemId === itemId,
      ),
    [isUpdatingWarehouseInboundPlacement, updatingWarehouseInboundPlacementVars],
  );

  const anyPlacementSavingForInbound = React.useCallback(
    (inboundId: string) =>
      Boolean(
        isUpdatingWarehouseInboundPlacement &&
          updatingWarehouseInboundPlacementVars?.inboundId === inboundId,
      ),
    [isUpdatingWarehouseInboundPlacement, updatingWarehouseInboundPlacementVars],
  );

  const anyReceivedQtySavingForInbound = React.useCallback(
    (inboundId: string) =>
      Boolean(
        isUpdatingInboundReceivedQty && updatingInboundReceivedVars?.inboundId === inboundId,
      ),
    [isUpdatingInboundReceivedQty, updatingInboundReceivedVars],
  );

  const completePlacementBusy = (rowId: string) =>
    Boolean(isCompletingWarehouseInboundPlacement && completingWarehouseInboundPlacementId === rowId);

  /** Блокирует повторные нажатия «завершить» и прочие действия, пока идёт любая мутация по заявкам /inbounds. */
  const inboundPanelBusy =
    Boolean(isPostingInbounds) ||
    Boolean(isStartingInboundReceiving) ||
    Boolean(isCancellingWarehouseInbound) ||
    Boolean(isUpdatingInboundReceivedQty) ||
    Boolean(isCompletingWarehouseInboundReceiving) ||
    Boolean(isUpdatingWarehouseInboundPlacement) ||
    Boolean(isCompletingWarehouseInboundPlacement);

  const runInboundImportInspection = React.useCallback(() => {
    if (inboundPanelBusy || catalogLoading) return;
    if (productsForPartner.length === 0) {
      toast.error("Нет товаров в каталоге для проверки");
      return;
    }
    setInboundImportPreview(inspectWarehouseImportPaste(inboundPasteText, productsForPartner));
  }, [inboundPasteText, inboundPanelBusy, catalogLoading, productsForPartner]);

  const applyInboundImportFromPreview = React.useCallback(() => {
    if (inboundApplyImportLockedRef.current) return;
    const preview = inboundImportPreview;
    if (!preview || preview.errors.length > 0 || preview.resolvedRows.length === 0) return;
    if (inboundPanelBusy || catalogLoading) return;
    inboundApplyImportLockedRef.current = true;
    try {
      setLines((prev) => mergeInboundImportDraftLines(prev, preview.resolvedRows));
      setInboundImportPreview(null);
      setInboundPasteText("");
      setInboundPasteOpen(false);
      toast.success("Данные загружены");
    } finally {
      queueMicrotask(() => {
        inboundApplyImportLockedRef.current = false;
      });
    }
  }, [inboundImportPreview, inboundPanelBusy, catalogLoading]);

  const handleInboundExcelFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (inboundPanelBusy || catalogLoading) return;
      if (productsForPartner.length === 0) {
        toast.error("Нет товаров в каталоге для проверки");
        return;
      }
      const prep = await inboundImportFileToPasteText(file);
      if (!prep.ok) {
        setInboundPasteText("");
        setInboundPasteOpen(true);
        setInboundImportPreview(
          warehouseImportInspectionFromMessage(prep.message, prep.fileRowNumber ?? 0),
        );
        return;
      }
      setInboundPasteText(prep.text);
      setInboundPasteOpen(true);
      setInboundImportPreview(inspectWarehouseImportPaste(prep.text, productsForPartner));
    },
    [inboundPanelBusy, catalogLoading, productsForPartner],
  );

  const completeInboundPlacementFor = React.useCallback(
    async (inboundId: string) => {
      try {
        await completeWarehouseInboundPlacement(inboundId);
        toast.success("Размещение завершено, перемещения в ячейки созданы");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось завершить размещение";
        toast.error(msg);
      }
    },
    [completeWarehouseInboundPlacement],
  );

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Создание заявки на приёмку</CardTitle>
          <CardDescription className="text-slate-500">
            План поступления (POST /inbounds). Партнёр — юрлицо из справочника; товары — из каталога. Не создаёт складскую задачу приёмки автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Партнёр</Label>
              <Select
                value={partnerId || undefined}
                onValueChange={setPartnerId}
                disabled={inboundPanelBusy || catalogLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите партнёра" />
                </SelectTrigger>
                <SelectContent>
                  {(entities ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ожидаемая дата</Label>
              <Input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                disabled={inboundPanelBusy || catalogLoading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Комментарий</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Необязательно"
              disabled={inboundPanelBusy || catalogLoading}
            />
          </div>
          <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50/60 p-3">
            <div className="min-w-0 space-y-2">
              <Label className="text-sm font-medium text-slate-900">Импорт из Excel</Label>
              <WarehouseImportExcelDescription />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={inboundPanelBusy || catalogLoading}
                  onClick={() => downloadWarehouseImportTemplateXlsx("inbound")}
                >
                  Скачать шаблон
                </Button>
                <input
                  ref={inboundFileInputRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="sr-only"
                  aria-label="Выбор файла .xlsx или .csv для импорта позиций приёмки"
                  onChange={(ev) => void handleInboundExcelFileChange(ev)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={inboundPanelBusy || catalogLoading}
                  onClick={() => inboundFileInputRef.current?.click()}
                >
                  Загрузить файл Excel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={inboundPanelBusy || catalogLoading}
                  onClick={() => setInboundPasteOpen((o) => !o)}
                >
                  Вставить данные из Excel
                </Button>
              </div>
            </div>
            {inboundPasteOpen ? (
              <div className="space-y-2 pt-1">
                <Textarea
                  value={inboundPasteText}
                  onChange={(e) => {
                    setInboundPasteText(e.target.value);
                    setInboundImportPreview(null);
                  }}
                  rows={6}
                  placeholder={WAREHOUSE_IMPORT_TEXTAREA_PLACEHOLDER}
                  disabled={inboundPanelBusy || catalogLoading}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={inboundPanelBusy || catalogLoading}
                  onClick={runInboundImportInspection}
                >
                  {WAREHOUSE_IMPORT_BTN_CHECK}
                </Button>
              </div>
            ) : null}
            <WarehouseImportPreviewPanel
              preview={inboundImportPreview}
              disabled={inboundPanelBusy || catalogLoading}
              onApply={applyInboundImportFromPreview}
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="mb-0">Позиции</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addLine}
                className="h-8 gap-1"
                disabled={inboundPanelBusy || catalogLoading}
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить строку
              </Button>
            </div>
            {!partnerId ? (
              <p className="text-xs text-amber-800">Сначала выберите партнёра — будет проще выбрать товары клиента.</p>
            ) : null}
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              {catalogLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : productsForPartner.length === 0 ? (
                <p className="text-sm text-slate-600">В каталоге нет товаров для отображения.</p>
              ) : (
                lines.map((line, idx) => (
                  <div key={line.key} className="grid gap-2 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-7">
                      <Label className="text-xs text-slate-500">Товар {idx + 1}</Label>
                      <Select
                        value={line.productId || undefined}
                        onValueChange={(v) => updateLine(line.key, { productId: v })}
                        disabled={inboundPanelBusy || catalogLoading}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Выберите товар" />
                        </SelectTrigger>
                        <SelectContent>
                          {productsForPartner.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · {p.supplierArticle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs text-slate-500">План, шт.</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-9"
                        value={line.plannedQty}
                        onChange={(e) => updateLine(line.key, { plannedQty: e.target.value })}
                        disabled={inboundPanelBusy || catalogLoading}
                      />
                    </div>
                    <div className="flex md:col-span-2 md:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 text-slate-600"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length <= 1 || inboundPanelBusy || catalogLoading}
                        aria-label="Удалить строку"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={isPostingInbounds || catalogLoading || inboundPanelBusy}
          >
            {isPostingInbounds ? "Создание…" : "Создать приёмку"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Список заявок (GET /inbounds)</CardTitle>
          <CardDescription className="text-slate-500">Созданные заявки хранятся локально в браузере (демо API).</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : listError ? (
            <p className="text-sm text-destructive">Не удалось загрузить список заявок.</p>
          ) : !inboundList?.length ? (
            <p className="text-xs text-slate-600">Нет данных</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-10 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="w-8 px-1 text-center text-xs font-semibold text-slate-500" aria-label="Развернуть" />
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">ID</TableHead>
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">Партнёр</TableHead>
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">Дата план</TableHead>
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">Режим</TableHead>
                    <TableHead className="px-2 py-2 text-right text-xs font-semibold text-slate-600">Позиций</TableHead>
                    <TableHead className="px-2 py-2 text-xs font-semibold text-slate-600">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inboundList.map((row) => {
                    const isExpanded = expandedInboundIds.has(row.id);
                    const hasDetailRow =
                      row.status === "new" ||
                      row.status === "receiving" ||
                      row.status === "received" ||
                      row.status === "placed" ||
                      row.status === "cancelled";
                    return (
                    <React.Fragment key={row.id}>
                      <TableRow
                        className={cn(
                          "h-10 cursor-pointer border-slate-100 text-xs transition-colors",
                          isExpanded ? "bg-slate-50/90" : "hover:bg-slate-50/60",
                        )}
                        onClick={() => toggleInboundRowExpansion(row.id)}
                      >
                        <TableCell className="w-8 px-1 text-center align-middle text-xs text-slate-600" aria-hidden>
                          {isExpanded ? "▼" : "▶"}
                        </TableCell>
                        <TableCell className="max-w-[180px] px-2 py-2 align-middle">
                          <div className="truncate font-mono text-xs tabular-nums">{row.id}</div>
                          {row.originInboundId ? (
                            <div className="mt-0.5 text-xs leading-tight text-slate-500">
                              Создано из заявки{" "}
                              <span className="break-all font-mono text-[11px]">{row.originInboundId}</span>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-2 py-2 align-middle text-xs text-slate-800">{entityName(row.partnerId)}</TableCell>
                        <TableCell className="px-2 py-2 align-middle text-xs tabular-nums text-slate-800">
                          {formatPlannedDate(row.plannedDate)}
                        </TableCell>
                        <TableCell className="px-2 py-2 align-middle">
                          <div className="flex min-w-[140px] flex-col items-start gap-1">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                                row.status === "placed"
                                  ? "border-sky-200 bg-sky-50 text-sky-900"
                                  : row.status === "received"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : row.status === "receiving"
                                      ? "border-violet-200 bg-violet-50 text-violet-900"
                                      : row.status === "cancelled"
                                        ? "border-rose-200 bg-rose-50 text-rose-900"
                                        : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              {statusLabel(row)}
                            </span>
                            {row.status === "received" ? (
                              <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-200/80">
                                Требует размещения
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 align-middle text-xs text-slate-700">
                          {isExpanded &&
                          (row.status === "receiving" || row.status === "received" || row.status === "placed") &&
                          row.receivingMode
                            ? receivingModeLabel(row.receivingMode)
                            : "—"}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-right align-middle text-xs tabular-nums text-slate-800">
                          {row.items.length}
                        </TableCell>
                        <TableCell className="align-top px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          {!isExpanded && row.status === "received" ? (
                            <WmsTableRowActions
                              items={[
                                {
                                  id: "to-placement",
                                  label: "Перейти",
                                  disabled: inboundPanelBusy,
                                  onSelect: () => expandInboundRowAndScrollToPlacement(row.id),
                                },
                              ]}
                            />
                          ) : null}
                          {isExpanded && row.status === "new" ? (
                            <WmsTableRowActions
                              items={[
                                {
                                  id: "start-recv",
                                  label: rowReceivingBusy(row.id) ? "Запрос…" : "Начать приёмку",
                                  disabled: rowReceivingBusy(row.id) || inboundPanelBusy,
                                  onSelect: () => setModeDialogInboundId(row.id),
                                },
                                {
                                  id: "cancel-new",
                                  label:
                                    isCancellingWarehouseInbound && cancellingWarehouseInboundId === row.id
                                      ? "Отмена…"
                                      : "Отменить приёмку",
                                  disabled: inboundRowMutationPending(row.id),
                                  onSelect: () => void cancelInboundFor(row.id),
                                },
                              ]}
                            />
                          ) : isExpanded && row.status === "receiving" ? (
                            <WmsTableRowActions
                              items={[
                                {
                                  id: "cancel-recv",
                                  label:
                                    isCancellingWarehouseInbound && cancellingWarehouseInboundId === row.id
                                      ? "Отмена…"
                                      : "Отменить приёмку",
                                  disabled: inboundRowMutationPending(row.id),
                                  onSelect: () => void cancelInboundFor(row.id),
                                },
                              ]}
                            />
                          ) : isExpanded && row.status === "received" ? (
                            <WmsTableRowActions
                              items={[
                                {
                                  id: "scroll-place",
                                  label: "Перейти",
                                  disabled: inboundPanelBusy,
                                  onSelect: () => scrollInboundPlacementIntoView(row.id),
                                },
                              ]}
                            />
                          ) : isExpanded ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasDetailRow ? (
                        <TableRow className="border-t-0 bg-slate-50/70 hover:bg-slate-50/70">
                          <TableCell colSpan={8} className="p-0 align-top">
                            <div className="space-y-2 p-3">
                              {row.status === "cancelled" ? (
                                <div className="rounded-md border border-rose-100 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
                                  Приёмка отменена. Действие недоступно.
                                </div>
                              ) : null}
                              {row.status === "received" ? (
                                <div className="space-y-2">
                                  <div
                                    role="status"
                                    className="rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs leading-snug text-amber-950"
                                  >
                                    Товар принят, но не размещён. Недоступно для отгрузки до размещения.
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs text-slate-600">
                                      Приёмка завершена. Если был недовоз — создана заявка на остаток.
                                    </p>
                                    {continuationInboundIdByOrigin.has(row.id) ? (
                                      <p className="text-xs text-sky-800">
                                        Есть продолжение заявки:{" "}
                                        <span className="font-mono tabular-nums">
                                          {continuationInboundIdByOrigin.get(row.id)}
                                        </span>
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              ) : row.status === "placed" ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-slate-600">
                                    Размещение завершено. Товар размещён по ячейкам.
                                  </p>
                                  {continuationInboundIdByOrigin.has(row.id) ? (
                                    <p className="text-xs text-sky-800">
                                      Есть продолжение заявки:{" "}
                                      <span className="font-mono tabular-nums">
                                        {continuationInboundIdByOrigin.get(row.id)}
                                      </span>
                                    </p>
                                  ) : null}
                                </div>
                              ) : row.status === "receiving" ? (
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <p className="text-xs text-slate-600">
                                    Внесите факт по строкам. По завершении создаются движения приёмки в зону приёмки. Если
                                    принято меньше плана — будет создана заявка на остаток.
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={
                                      inboundPanelBusy ||
                                      completeReceivingBusy(row.id) ||
                                      anyReceivedQtySavingForInbound(row.id) ||
                                      !row.items.some((it) => Math.max(0, Math.trunc(Number(it.receivedQty) || 0)) > 0)
                                    }
                                    onClick={() => void completeInboundReceivingFor(row.id)}
                                  >
                                    {completeReceivingBusy(row.id) ? "Завершение…" : "Завершить приёмку"}
                                  </Button>
                                </div>
                              ) : row.status === "new" ? (
                                <p className="text-sm text-slate-700">
                                  Заявка создана. Можно начать или отменить приёмку.
                                </p>
                              ) : null}
                              {row.status === "cancelled" ? (
                                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-50/90">
                                        <TableHead className="text-xs font-semibold">Товар</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">План</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">Принято</TableHead>
                                        <TableHead className="text-xs font-semibold">Факт</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">Факт / план</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {row.items.map((item) => (
                                        <InboundReceivingQtyRow
                                          key={item.id}
                                          item={item}
                                          productLine={receivingUiLineForProductId(item.productId)}
                                          editable={false}
                                          disabled
                                          onSave={async () => {}}
                                        />
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : row.status === "new" ? null : (
                                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-50/90">
                                        <TableHead className="text-xs font-semibold">Товар</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">План</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">Принято</TableHead>
                                        <TableHead className="text-xs font-semibold">
                                          {row.status === "receiving" ? "Изменить факт" : "Факт"}
                                        </TableHead>
                                        <TableHead className="text-right text-xs font-semibold">Факт / план</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {row.items.map((item) => (
                                        <InboundReceivingQtyRow
                                          key={item.id}
                                          item={item}
                                          productLine={receivingUiLineForProductId(item.productId)}
                                          editable={row.status === "receiving"}
                                          disabled={
                                            inboundPanelBusy ||
                                            lineReceivedQtyBusy(row.id, item.id) ||
                                            completeReceivingBusy(row.id)
                                          }
                                          onSave={(qty) => persistReceivedQty(row.id, item.id, qty)}
                                        />
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              {row.status === "received" || row.status === "placed" ? (
                                <div id={`inbound-placement-${row.id}`} className="space-y-3 scroll-mt-4 pt-2">
                                  {row.status === "received" ? (
                                    <p className="text-xs font-medium leading-snug text-slate-700">
                                      Разместите товар в ячейки хранения — станет доступно для отгрузки.
                                    </p>
                                  ) : null}
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                      Размещение по ячейкам
                                    </p>
                                    {row.status === "placed" ? (
                                      <p className="mt-0.5 text-xs text-slate-500">Только просмотр, изменение недоступно.</p>
                                    ) : null}
                                  </div>
                                  {!storageLocations.length && row.status === "received" ? (
                                    <p className="text-xs text-amber-800">В справочнике нет ячеек хранения — добавьте места типа «Хранение».</p>
                                  ) : null}
                                  {row.items.map((item) => (
                                    <InboundLinePlacementsBlock
                                      key={item.id}
                                      item={item}
                                      productLine={receivingUiLineForProductId(item.productId)}
                                      readOnly={row.status === "placed"}
                                      storageLocations={storageLocations}
                                      locationName={locationNameById}
                                      persistBusy={placementLineBusy(row.id, item.id)}
                                      flowLocked={inboundPanelBusy}
                                      onPersist={(pl) => persistPlacementForLine(row.id, item.id, pl)}
                                      partnerId={row.partnerId}
                                      inventoryMovements={inventoryMovementsSafe}
                                      catalogItems={Array.isArray(catalog) ? catalog : []}
                                    />
                                  ))}
                                  {row.status === "received" ? (
                                    <div className="pt-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          inboundPanelBusy ||
                                          completePlacementBusy(row.id) ||
                                          anyPlacementSavingForInbound(row.id) ||
                                          !isInboundPlacementFullyDistributed(row) ||
                                          !storageLocations.length
                                        }
                                        onClick={() => void completeInboundPlacementFor(row.id)}
                                      >
                                        {completePlacementBusy(row.id) ? "Завершение…" : "Завершить размещение"}
                                      </Button>
                                    </div>
                                  ) : null}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={modeDialogInboundId !== null} onOpenChange={(open) => !open && setModeDialogInboundId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Начало приёмки</DialogTitle>
            <DialogDescription>
              Выберите режим работы. Движения приёмки создаются только после нажатия «Завершить приёмку».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-start">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isStartingInboundReceiving || inboundPanelBusy}
              onClick={() => void confirmStartReceiving("manual")}
            >
              Ручной ввод
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isStartingInboundReceiving || inboundPanelBusy}
              onClick={() => void confirmStartReceiving("scan")}
            >
              Сканирование
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InboundWarehouseRequestsPanel;
