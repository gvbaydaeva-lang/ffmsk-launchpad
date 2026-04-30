import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/app/StatusBadge";
import type { InboundLineItem, InboundSupply } from "@/types/domain";
import { workflowFromInbound } from "@/lib/taskWorkflowUi";
import {
  planFactDiscrepancyText,
  planFactLineBadgeClass,
  planFactLineStatusLabel,
  planFactOverrun,
  planFactRemaining,
  planFactRowBgClass,
} from "@/lib/planFactDiscrepancy";
import {
  buildPlanFactCompleteWarning,
  buildPlanFactMismatchLogDescription,
  getTaskValidation,
} from "@/utils/wmsValidation";
import { useAppendOperationLog } from "@/hooks/useWmsMock";
import { playScanErrorSound, playScanSuccessSound } from "@/utils/scanFeedbackSound";

type LastScanResult =
  | { status: "idle" }
  | { status: "success"; title: string; hint?: string }
  | { status: "error"; message: string };

type Props = {
  supply: InboundSupply;
  legalEntityName: string;
  receivingLocationName: string;
  isUpdatingInboundDraft: boolean;
  isUpdatingInbound: boolean;
  onBack: () => void;
  onStartReceiving: () => Promise<void>;
  onSaveItems: (items: InboundLineItem[]) => Promise<void>;
  onComplete: () => Promise<void>;
  onScanError?: (code: string, kind: "unknown" | "over") => void;
};

export default function ReceivingTaskWorkScreen({
  supply,
  legalEntityName,
  receivingLocationName,
  isUpdatingInboundDraft,
  isUpdatingInbound,
  onBack,
  onStartReceiving,
  onSaveItems,
  onComplete,
  onScanError,
}: Props) {
  const appendOperationLog = useAppendOperationLog();
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);
  const [flashState, setFlashState] = React.useState<"ok" | "error" | null>(null);
  const [completePlanFactWarning, setCompletePlanFactWarning] = React.useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = React.useState<LastScanResult>({ status: "idle" });
  const [highlightedRowKey, setHighlightedRowKey] = React.useState<string | null>(null);
  const [rowHighlightTone, setRowHighlightTone] = React.useState<"success" | "error" | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const rowHighlightTimerRef = React.useRef<number | null>(null);
  const workflow = workflowFromInbound(supply);
  const itemsSafe = React.useMemo(() => (Array.isArray(supply.items) ? supply.items : []), [supply.items]);

  const clearRowHighlightLater = React.useCallback(() => {
    if (rowHighlightTimerRef.current != null) {
      window.clearTimeout(rowHighlightTimerRef.current);
    }
    rowHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedRowKey(null);
      setRowHighlightTone(null);
      rowHighlightTimerRef.current = null;
    }, 1600);
  }, []);

  React.useEffect(() => {
    return () => {
      if (rowHighlightTimerRef.current != null) window.clearTimeout(rowHighlightTimerRef.current);
    };
  }, []);

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

  React.useEffect(() => {
    if (workflow === "processing") {
      setLastScanResult({ status: "idle" });
      focusScanInput();
    }
  }, [workflow, focusScanInput, supply.id]);

  const progress = React.useMemo(() => {
    const plan = itemsSafe.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
    const fact = itemsSafe.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
    const remaining = Math.max(0, plan - fact);
    const overrun = Math.max(0, fact - plan);
    const percent = plan > 0 ? Math.min(100, Math.round((fact / plan) * 100)) : 0;
    return { plan, fact, remaining, overrun, percent };
  }, [itemsSafe]);

  const taskNeedsReview = React.useMemo(
    () =>
      progress.plan > 0 &&
      itemsSafe.some((it) => {
        const p = Number(it.plannedQuantity) || 0;
        const f = Number(it.factualQuantity) || 0;
        return p > 0 && p !== f;
      }),
    [itemsSafe, progress.plan],
  );

  const planFactLineItems = React.useMemo(
    () =>
      itemsSafe.map((it) => ({
        plannedQty: Number(it.plannedQuantity) || 0,
        factQty: Number(it.factualQuantity) || 0,
      })),
    [itemsSafe],
  );

  React.useEffect(() => {
    const v = getTaskValidation(planFactLineItems);
    if (v.totalRemaining === 0 && v.totalOver === 0) setCompletePlanFactWarning(null);
  }, [planFactLineItems]);

  const handleCompleteClick = async () => {
    const validation = getTaskValidation(planFactLineItems);
    const taskNo = (supply.documentNo || "").trim() || "—";
    if (validation.totalRemaining > 0 || validation.totalOver > 0) {
      const desc = buildPlanFactMismatchLogDescription(taskNo, validation);
      if (desc) {
        appendOperationLog({
          type: "TASK_MISMATCH",
          legalEntityId: supply.legalEntityId,
          legalEntityName,
          taskId: supply.id,
          taskNumber: supply.documentNo,
          description: desc,
        });
      }
      const w = buildPlanFactCompleteWarning(validation);
      if (w) setCompletePlanFactWarning(w);
    } else {
      setCompletePlanFactWarning(null);
    }
    await onComplete();
  };

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code) return;
    const idx = itemsSafe.findIndex((x) => (x.barcode || "").trim() === code);
    if (idx < 0) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedRowKey(null);
      setRowHighlightTone(null);
      setLastScanResult({ status: "error", message: "Товар не найден" });
      onScanError?.(code, "unknown");
      toast.error("Товар не найден в задании");
      focusScanInput();
      return;
    }
    const item = itemsSafe[idx];
    const rowKey = `${supply.id}-${(item.barcode || "").trim()}-${idx}`;
    if ((Number(item.factualQuantity) || 0) >= (Number(item.plannedQuantity) || 0)) {
      playScanErrorSound();
      triggerFlash("error");
      setHighlightedRowKey(rowKey);
      setRowHighlightTone("error");
      clearRowHighlightLater();
      setLastScanResult({ status: "error", message: "Уже выполнено" });
      onScanError?.(code, "over");
      toast.error("Количество уже принято");
      focusScanInput();
      return;
    }
    setIsSubmittingScan(true);
    try {
      const nextItems = itemsSafe.map((it, i) =>
        i === idx ? { ...it, factualQuantity: (Number(it.factualQuantity) || 0) + 1 } : it,
      );
      await onSaveItems(nextItems);
      setScanValue("");
      playScanSuccessSound();
      triggerFlash("ok");
      const hint = (item.name || item.supplierArticle || item.barcode || "").trim();
      setLastScanResult({
        status: "success",
        title: "Принято +1",
        hint: hint || undefined,
      });
      setHighlightedRowKey(rowKey);
      setRowHighlightTone("success");
      clearRowHighlightLater();
      toast.success(`Принято: ${item.name || item.supplierArticle || item.barcode}`);
      focusScanInput();
    } catch {
      playScanErrorSound();
      triggerFlash("error");
      setLastScanResult({ status: "error", message: "Не удалось сохранить" });
      focusScanInput();
    } finally {
      setIsSubmittingScan(false);
    }
  };

  const canSubmitComplete = workflow === "processing" && progress.plan > 0;

  return (
    <Card
      className={`border-slate-200 shadow-sm transition-colors duration-150 ${
        flashState === "ok" ? "bg-emerald-100/70" : flashState === "error" ? "bg-rose-100/70" : ""
      }`}
    >
      <CardHeader>
        <CardTitle className="text-base">Рабочий экран приёмки</CardTitle>
        <CardDescription>Сканирование и приёмка товаров по выбранному заданию</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-5">
          <div>
            <span className="text-slate-500">№ задания:</span>
            <div className="font-medium text-slate-900">{supply.documentNo || "—"}</div>
          </div>
          <div>
            <span className="text-slate-500">Юрлицо:</span>
            <div className="font-medium text-slate-900">{legalEntityName}</div>
          </div>
          <div>
            <span className="text-slate-500">Склад:</span>
            <div className="font-medium text-slate-900">{supply.destinationWarehouse || "—"}</div>
          </div>
          <div>
            <span className="text-slate-500">Статус:</span>
            <div className="mt-0.5">
              <StatusBadge status={workflow} requiresReview={taskNeedsReview} />
            </div>
          </div>
          <div>
            <span className="text-slate-500">Дата:</span>
            <div className="font-medium text-slate-900">
              {supply.eta ? format(parseISO(supply.eta), "dd.MM.yyyy HH:mm", { locale: ru }) : "—"}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Товары после приёмки будут размещены в:{" "}
          <span className="font-medium text-slate-900">{receivingLocationName || "ПРИЕМКА"}</span>
        </div>

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
            disabled={!scanValue.trim() || isSubmittingScan || isUpdatingInboundDraft}
          >
            {isSubmittingScan || isUpdatingInboundDraft ? "Обработка..." : "Пикнуть"}
          </Button>
        </div>

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

        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">
              План {progress.plan} · Факт {progress.fact} ·{" "}
              {progress.remaining === 0 ? (
                <span className="font-semibold text-emerald-600">Готово</span>
              ) : (
                <span className="font-semibold text-amber-600">Осталось {progress.remaining}</span>
              )}
              {progress.overrun > 0 ? (
                <span className="text-slate-700">{` · Перерасход ${progress.overrun}`}</span>
              ) : null}
            </span>
            <span className={cn("tabular-nums", progress.remaining === 0 ? "font-semibold text-emerald-600" : "text-slate-600")}>
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
                <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Место</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">План</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Факт</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Осталось</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Перерасход</th>
                <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Расхождение</th>
                <th className="border-b px-2 py-1.5 text-left text-xs font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {itemsSafe.map((item, index) => {
                const plan = Number(item.plannedQuantity) || 0;
                const fact = Number(item.factualQuantity) || 0;
                const rem = planFactRemaining(plan, fact);
                const over = planFactOverrun(plan, fact);
                const disc = planFactDiscrepancyText(plan, fact);
                const rowBg = planFactRowBgClass(plan, fact);
                const rowKey = `${supply.id}-${(item.barcode || "").trim()}-${index}`;
                const flashRow =
                  highlightedRowKey === rowKey && rowHighlightTone === "success"
                    ? "bg-emerald-100 ring-2 ring-inset ring-emerald-400/90"
                    : highlightedRowKey === rowKey && rowHighlightTone === "error"
                      ? "bg-rose-100 ring-2 ring-inset ring-rose-400/90"
                      : "";
                return (
                  <tr
                    key={rowKey}
                    className={cn("odd:bg-white even:bg-slate-50/50 transition-colors duration-150", rowBg, flashRow)}
                  >
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.name || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.supplierArticle || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 font-mono text-[11px]">{item.barcode || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{supply.marketplace.toUpperCase()}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.color || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.size || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{receivingLocationName || "ПРИЕМКА"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-xs">{plan}</td>
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-xs">{fact}</td>
                    <td
                      className={`border-b border-r px-2 py-1.5 text-right tabular-nums text-xs ${
                        rem > 0 ? "font-medium text-amber-800" : ""
                      }`}
                    >
                      {rem}
                    </td>
                    <td className={`border-b border-r px-2 py-1.5 text-right tabular-nums text-xs ${over > 0 ? "font-medium text-red-700" : ""}`}>
                      {over}
                    </td>
                    <td className="border-b border-r px-2 py-1.5 text-xs text-slate-700">{disc ?? "—"}</td>
                    <td className="border-b px-2 py-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${planFactLineBadgeClass(plan, fact)}`}
                      >
                        {planFactLineStatusLabel(plan, fact)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {workflow === "pending" ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full max-w-sm"
            onClick={() => void onStartReceiving()}
            disabled={isUpdatingInbound}
          >
            В работу
          </Button>
        ) : null}

        <div className="space-y-2">
          <div className="flex max-w-sm flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full shrink-0 rounded-lg bg-emerald-600 font-semibold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
              onClick={() => void handleCompleteClick()}
              disabled={!canSubmitComplete || isUpdatingInbound}
            >
              Завершить
            </Button>
            {completePlanFactWarning ? (
              <p className="text-xs font-medium leading-snug text-amber-800 sm:pt-2">{completePlanFactWarning}</p>
            ) : null}
          </div>
          {!completePlanFactWarning && workflow === "processing" && taskNeedsReview ? (
            <p className="text-xs font-medium text-amber-800">Есть расхождения план/факт. Завершение доступно с предупреждением.</p>
          ) : null}
          {!completePlanFactWarning && workflow === "processing" && !taskNeedsReview && progress.plan > 0 && progress.fact < progress.plan ? (
            <p className="text-xs text-slate-600">Осталось принять: {progress.remaining} шт.</p>
          ) : null}
        </div>
        <button type="button" onClick={onBack} className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full max-w-sm")}>
          назад к списку
        </button>
      </CardContent>
    </Card>
  );
}
