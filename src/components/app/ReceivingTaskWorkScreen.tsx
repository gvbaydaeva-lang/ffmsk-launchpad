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

type Props = {
  supply: InboundSupply;
  legalEntityName: string;
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
  isUpdatingInboundDraft,
  isUpdatingInbound,
  onBack,
  onStartReceiving,
  onSaveItems,
  onComplete,
  onScanError,
}: Props) {
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);
  const [flashState, setFlashState] = React.useState<"ok" | "error" | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const workflow = workflowFromInbound(supply);

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
      focusScanInput();
    }
  }, [workflow, focusScanInput]);

  const progress = React.useMemo(() => {
    const plan = supply.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
    const fact = supply.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
    const remaining = Math.max(0, plan - fact);
    const overrun = Math.max(0, fact - plan);
    const percent = plan > 0 ? Math.min(100, Math.round((fact / plan) * 100)) : 0;
    return { plan, fact, remaining, overrun, percent };
  }, [supply.items]);

  const taskNeedsReview = React.useMemo(
    () =>
      progress.plan > 0 &&
      supply.items.some((it) => {
        const p = Number(it.plannedQuantity) || 0;
        const f = Number(it.factualQuantity) || 0;
        return p > 0 && p !== f;
      }),
    [supply.items, progress.plan],
  );

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code) return;
    const idx = supply.items.findIndex((x) => (x.barcode || "").trim() === code);
    if (idx < 0) {
      triggerFlash("error");
      onScanError?.(code, "unknown");
      toast.error("Товар не найден в задании");
      focusScanInput();
      return;
    }
    const item = supply.items[idx];
    if ((Number(item.factualQuantity) || 0) >= (Number(item.plannedQuantity) || 0)) {
      triggerFlash("error");
      onScanError?.(code, "over");
      toast.error("Количество уже принято");
      focusScanInput();
      return;
    }
    setIsSubmittingScan(true);
    try {
      const nextItems = supply.items.map((it, i) =>
        i === idx ? { ...it, factualQuantity: (Number(it.factualQuantity) || 0) + 1 } : it,
      );
      await onSaveItems(nextItems);
      setScanValue("");
      triggerFlash("ok");
      toast.success(`Принято: ${item.name || item.supplierArticle || item.barcode}`);
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={scanInputRef}
            placeholder="Сканируйте штрихкод товара"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            className="h-14 text-xl"
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
            className="h-14 shrink-0 rounded-lg bg-blue-600 px-6 text-base font-semibold text-white shadow-none hover:bg-blue-700 disabled:opacity-50"
            onClick={() => void applyScan()}
            disabled={!scanValue.trim() || isSubmittingScan || isUpdatingInboundDraft}
          >
            {isSubmittingScan || isUpdatingInboundDraft ? "Обработка..." : "Пикнуть"}
          </Button>
        </div>

        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">
              План {progress.plan} · Факт {progress.fact} · Осталось {progress.remaining}
              {progress.overrun > 0 ? ` · Перерасход ${progress.overrun}` : null}
            </span>
            <span className="text-slate-600">{progress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
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
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Факт</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Осталось</th>
                <th className="border-b border-r px-2 py-1.5 text-right text-xs font-medium">Перерасход</th>
                <th className="border-b border-r px-2 py-1.5 text-left text-xs font-medium">Расхождение</th>
                <th className="border-b px-2 py-1.5 text-left text-xs font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {supply.items.map((item, index) => {
                const plan = Number(item.plannedQuantity) || 0;
                const fact = Number(item.factualQuantity) || 0;
                const rem = planFactRemaining(plan, fact);
                const over = planFactOverrun(plan, fact);
                const disc = planFactDiscrepancyText(plan, fact);
                const rowBg = planFactRowBgClass(plan, fact);
                return (
                  <tr
                    key={`${supply.id}-${item.barcode}-${index}`}
                    className={`odd:bg-white even:bg-slate-50/50 ${rowBg}`}
                  >
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.name || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.supplierArticle || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 font-mono text-[11px]">{item.barcode || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{supply.marketplace.toUpperCase()}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.color || "—"}</td>
                    <td className="border-b border-r px-2 py-1.5 text-xs">{item.size || "—"}</td>
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
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full max-w-sm rounded-lg bg-emerald-600 font-semibold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void onComplete()}
            disabled={!canSubmitComplete || isUpdatingInbound}
          >
            Завершить
          </Button>
          {workflow === "processing" && taskNeedsReview ? (
            <p className="text-xs font-medium text-amber-800">Есть расхождения план/факт. Завершение доступно с предупреждением.</p>
          ) : null}
          {workflow === "processing" && !taskNeedsReview && progress.plan > 0 && progress.fact < progress.plan ? (
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
