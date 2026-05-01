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
import { useLegalEntities, useLocations, useProductCatalog, useWarehouseInboundRequests } from "@/hooks/useWmsMock";
import type { InboundWarehouseReceivingMode, InboundWarehouseItem, InboundWarehouseRequest } from "@/types/domain";
import type { InboundPlacementInput } from "@/services/warehouseInboundApi";
import { parseInboundWarehousePaste, resolveInboundPasteCodeToProductId } from "@/lib/inboundWarehousePasteImport";
import { toast } from "sonner";

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

function sumPlacementsQty(item: InboundWarehouseItem): number {
  return item.placements.reduce((s, p) => s + Math.max(0, Math.trunc(Number(p.qty) || 0)), 0);
}

function isInboundPlacementFullyDistributed(row: InboundWarehouseRequest): boolean {
  return row.items.every((it) => {
    const rq = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    return sumPlacementsQty(it) === rq;
  });
}

function InboundLinePlacementsBlock({
  item,
  productName,
  readOnly,
  storageLocations,
  locationName,
  onPersist,
  persistBusy,
  flowLocked,
}: {
  item: InboundWarehouseItem;
  productName: string;
  readOnly: boolean;
  storageLocations: { id: string; name: string }[];
  locationName: (id: string) => string;
  onPersist: (pl: InboundPlacementInput[]) => Promise<void>;
  persistBusy: boolean;
  /** Глобальная блокировка панели (завершение приёмки/размещения и др.) */
  flowLocked?: boolean;
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

  if (readOnly) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-slate-900">{productName}</span>
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
        <div className="text-sm font-medium text-slate-900">{productName}</div>
        <p className="mt-1 text-xs text-slate-500">Нет принятого количества — размещение не требуется.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{productName}</span>
        <span className="text-xs tabular-nums text-slate-600">
          Принято: {receivedQty} · Распределено: {distributed} / {receivedQty}
        </span>
      </div>
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
  productName,
  onSave,
  disabled,
  editable = true,
}: {
  item: InboundWarehouseItem;
  productName: string;
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
      <TableCell className="text-sm font-medium text-slate-900">{productName}</TableCell>
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

  const productDisplayName = React.useCallback((productId: string) => productNameById.get(productId) ?? productId, [productNameById]);

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

  const handleInboundPasteLoad = React.useCallback(() => {
    if (inboundPanelBusy || catalogLoading) return;
    if (productsForPartner.length === 0) {
      toast.error("Нет товаров в каталоге для проверки");
      return;
    }
    const parsed = parseInboundWarehousePaste(inboundPasteText);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error("Нет данных для загрузки");
      return;
    }
    const resolved: { productId: string; qty: number }[] = [];
    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i];
      const match = resolveInboundPasteCodeToProductId(row.code, productsForPartner);
      if (!match.ok) {
        toast.error(`Строка ${i + 1}: ${match.message}`);
        return;
      }
      resolved.push({ productId: match.productId, qty: row.qty });
    }
    setLines((prev) => {
      const draft = prev.map((l) => ({ ...l }));
      for (const { productId, qty } of resolved) {
        const idx = draft.findIndex((l) => l.productId.trim() === productId);
        if (idx >= 0) {
          const cur = Math.max(0, Math.trunc(Number(draft[idx].plannedQty) || 0));
          draft[idx] = { ...draft[idx], plannedQty: String(cur + qty) };
        } else {
          draft.push({
            key: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            productId,
            plannedQty: String(qty),
          });
        }
      }
      return draft;
    });
    setInboundPasteText("");
    toast.success("Данные загружены");
  }, [inboundPasteText, inboundPanelBusy, catalogLoading, productsForPartner]);

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Label className="text-sm font-medium text-slate-900">Импорт из Excel</Label>
                <p className="mt-0.5 text-xs text-slate-600">
                  Каждая строка — <span className="font-medium">артикул или штрихкод, количество</span> (разделитель — запятая).
                  Можно также указать внутренний код товара из каталога. Пример:{" "}
                  <span className="font-mono">WB-A-10452,120</span> или <span className="font-mono">4601234567890,48</span>
                </p>
              </div>
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
            {inboundPasteOpen ? (
              <div className="space-y-2 pt-1">
                <Textarea
                  value={inboundPasteText}
                  onChange={(e) => setInboundPasteText(e.target.value)}
                  rows={6}
                  placeholder={"WB-A-10452, 120\n4601234567890, 48"}
                  disabled={inboundPanelBusy || catalogLoading}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={inboundPanelBusy || catalogLoading}
                  onClick={handleInboundPasteLoad}
                >
                  Загрузить
                </Button>
              </div>
            ) : null}
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
            <p className="text-sm text-slate-600">Заявок пока нет.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/90">
                    <TableHead className="text-xs font-semibold">ID</TableHead>
                    <TableHead className="text-xs font-semibold">Партнёр</TableHead>
                    <TableHead className="text-xs font-semibold">Дата план</TableHead>
                    <TableHead className="text-xs font-semibold">Статус</TableHead>
                    <TableHead className="text-xs font-semibold">Режим</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Позиций</TableHead>
                    <TableHead className="text-xs font-semibold">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inboundList.map((row) => (
                    <React.Fragment key={row.id}>
                      <TableRow>
                        <TableCell className="max-w-[180px]">
                          <div className="truncate font-mono text-xs tabular-nums">{row.id}</div>
                          {row.originInboundId ? (
                            <div className="mt-0.5 text-[11px] leading-tight text-slate-500">
                              Создано из заявки{" "}
                              <span className="break-all font-mono text-[10px]">{row.originInboundId}</span>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{entityName(row.partnerId)}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatPlannedDate(row.plannedDate)}</TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {(row.status === "receiving" || row.status === "received" || row.status === "placed") &&
                          row.receivingMode
                            ? receivingModeLabel(row.receivingMode)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.items.length}</TableCell>
                        <TableCell>
                          {row.status === "new" ? (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                disabled={rowReceivingBusy(row.id) || inboundPanelBusy}
                                onClick={() => setModeDialogInboundId(row.id)}
                              >
                                {rowReceivingBusy(row.id) ? "Запрос…" : "Начать приёмку"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={inboundRowMutationPending(row.id)}
                                onClick={() => void cancelInboundFor(row.id)}
                              >
                                {isCancellingWarehouseInbound && cancellingWarehouseInboundId === row.id
                                  ? "Отмена…"
                                  : "Отменить приёмку"}
                              </Button>
                            </div>
                          ) : row.status === "receiving" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={inboundRowMutationPending(row.id)}
                              onClick={() => void cancelInboundFor(row.id)}
                            >
                              {isCancellingWarehouseInbound && cancellingWarehouseInboundId === row.id
                                ? "Отмена…"
                                : "Отменить приёмку"}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {row.status === "receiving" ||
                      row.status === "received" ||
                      row.status === "placed" ||
                      row.status === "cancelled" ? (
                        <TableRow className="border-t-0 bg-slate-50/70 hover:bg-slate-50/70">
                          <TableCell colSpan={7} className="p-0 align-top">
                            <div className="space-y-2 p-3">
                              {row.status === "cancelled" ? (
                                <div className="rounded-md border border-rose-100 bg-rose-50/80 px-3 py-2 text-sm text-rose-900">
                                  Приёмка отменена. Действия недоступны.
                                </div>
                              ) : null}
                              {row.status === "received" ? (
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
                              ) : null}
                              {row.status !== "cancelled" ? (
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
                                          productName={productDisplayName(item.productId)}
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
                              ) : (
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
                                          productName={productDisplayName(item.productId)}
                                          editable={false}
                                          disabled
                                          onSave={async () => {}}
                                        />
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              {row.status === "received" || row.status === "placed" ? (
                                <div className="space-y-3 pt-2">
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
                                      productName={productDisplayName(item.productId)}
                                      readOnly={row.status === "placed"}
                                      storageLocations={storageLocations}
                                      locationName={locationNameById}
                                      persistBusy={placementLineBusy(row.id, item.id)}
                                      flowLocked={inboundPanelBusy}
                                      onPersist={(pl) => persistPlacementForLine(row.id, item.id, pl)}
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
                  ))}
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
