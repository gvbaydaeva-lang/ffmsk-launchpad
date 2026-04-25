import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/app/StatusBadge";
import type { InboundLineItem, InboundSupply } from "@/types/domain";
import { workflowFromInbound } from "@/lib/taskWorkflowUi";

type Props = {
  supply: InboundSupply;
  legalEntityName: string;
  isUpdatingInboundDraft: boolean;
  isUpdatingInbound: boolean;
  onBack: () => void;
  onStartReceiving: () => Promise<void>;
  onSaveItems: (items: InboundLineItem[]) => Promise<void>;
  onComplete: (factTotal: number) => Promise<void>;
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
    focusScanInput();
  }, [focusScanInput]);

  const progress = React.useMemo(() => {
    const plan = supply.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
    const fact = supply.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
    const remaining = Math.max(0, plan - fact);
    const percent = plan > 0 ? Math.min(100, Math.round((fact / plan) * 100)) : 0;
    return { plan, fact, remaining, percent };
  }, [supply.items]);

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code) return;
    const idx = supply.items.findIndex((x) => (x.barcode || "").trim() === code);
    if (idx < 0) {
      triggerFlash("error");
      toast.error("Товар не найден в задании");
      focusScanInput();
      return;
    }
    const item = supply.items[idx];
    if ((Number(item.factualQuantity) || 0) >= (Number(item.plannedQuantity) || 0)) {
      triggerFlash("error");
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

  const canComplete =
    progress.plan > 0 && supply.items.every((item) => (Number(item.factualQuantity) || 0) === (Number(item.plannedQuantity) || 0));

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
          <div><span className="text-slate-500">№ задания:</span><div className="font-medium text-slate-900">{supply.documentNo || "—"}</div></div>
          <div><span className="text-slate-500">Юрлицо:</span><div className="font-medium text-slate-900">{legalEntityName}</div></div>
          <div><span className="text-slate-500">Склад:</span><div className="font-medium text-slate-900">{supply.destinationWarehouse || "—"}</div></div>
          <div><span className="text-slate-500">Статус:</span><div className="mt-0.5"><StatusBadge status={workflow} /></div></div>
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
            onBlur={() => focusScanInput()}
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
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">
              План {progress.plan} · Факт {progress.fact} · Осталось {progress.remaining}
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
                <th className="border-b border-r px-3 py-2 text-left font-medium">Название</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">Артикул</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">Баркод</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">Маркетплейс</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">Цвет</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">Размер</th>
                <th className="border-b border-r px-3 py-2 text-right font-medium">План</th>
                <th className="border-b border-r px-3 py-2 text-right font-medium">Факт</th>
                <th className="border-b border-r px-3 py-2 text-right font-medium">Осталось</th>
                <th className="border-b px-3 py-2 text-left font-medium">Статус строки</th>
              </tr>
            </thead>
            <tbody>
              {supply.items.map((item, index) => {
                const plan = Number(item.plannedQuantity) || 0;
                const fact = Number(item.factualQuantity) || 0;
                const remaining = plan - fact;
                const rowStatus = fact > plan ? "Ошибка" : fact === 0 ? "Не принято" : fact < plan ? "В процессе" : "Принято";
                const rowStatusClass =
                  fact > plan
                    ? "bg-red-100 text-red-700 ring-red-200"
                    : fact === 0
                      ? "bg-slate-100 text-slate-700 ring-slate-200"
                      : fact < plan
                        ? "bg-violet-100 text-violet-700 ring-violet-200"
                        : "bg-emerald-100 text-emerald-700 ring-emerald-200";
                return (
                  <tr key={`${supply.id}-${item.barcode}-${index}`} className={`odd:bg-white even:bg-slate-50/50 ${fact > plan ? "bg-red-50/80" : ""}`}>
                    <td className="border-b border-r px-3 py-2">{item.name || "—"}</td>
                    <td className="border-b border-r px-3 py-2">{item.supplierArticle || "—"}</td>
                    <td className="border-b border-r px-3 py-2 font-mono text-xs">{item.barcode || "—"}</td>
                    <td className="border-b border-r px-3 py-2">{supply.marketplace.toUpperCase()}</td>
                    <td className="border-b border-r px-3 py-2">{item.color || "—"}</td>
                    <td className="border-b border-r px-3 py-2">{item.size || "—"}</td>
                    <td className="border-b border-r px-3 py-2 text-right tabular-nums">{plan}</td>
                    <td className="border-b border-r px-3 py-2 text-right tabular-nums">{fact}</td>
                    <td className={`border-b border-r px-3 py-2 text-right tabular-nums ${remaining !== 0 ? "font-medium text-red-700" : ""}`}>
                      {Math.max(0, remaining)}
                    </td>
                    <td className="border-b px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${rowStatusClass}`}>{rowStatus}</span>
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
            onClick={() => void onComplete(progress.fact)}
            disabled={!canComplete || isUpdatingInbound}
          >
            Завершить
          </Button>
          {!canComplete ? (
            <p className="text-sm font-medium text-red-600">Не все товары приняты. Осталось: {progress.remaining}</p>
          ) : null}
        </div>

        <Button variant="outline" className="h-10 w-full max-w-sm" onClick={onBack}>
          Назад к списку
        </Button>
      </CardContent>
    </Card>
  );
}
