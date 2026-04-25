import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import type { OutboundShipment } from "@/types/domain";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PackingTask = {
  key: string;
  label: string;
  legalEntityId: string;
  marketplaceLabel: string;
  shipments: OutboundShipment[];
};

type ScanLine = {
  key: string;
  barcode: string;
  article: string;
  color: string;
  size: string;
  plan: number;
  fact: number;
  shipmentRefs: Array<{ shipmentId: string; plan: number; fact: number }>;
};

const PackingPage = () => {
  const { data: outbound, isLoading, error, updateOutboundDraft, isUpdatingOutboundDraft } = useOutboundShipments();
  const { data: catalog } = useProductCatalog();
  const { data: legal } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const queryClient = useQueryClient();
  const [selectedTaskKey, setSelectedTaskKey] = React.useState("");
  const [startedTaskKey, setStartedTaskKey] = React.useState<string | null>(null);
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);

  const activeShipments = React.useMemo(() => {
    const rows = outbound ?? [];
    return rows
      .filter((x) => x.status !== "отгружено")
      .filter((x) => legalEntityId === "all" || x.legalEntityId === legalEntityId)
      .sort((a, b) => (a.assignmentNo || a.id).localeCompare(b.assignmentNo || b.id, "ru"));
  }, [outbound, legalEntityId]);

  const tasks = React.useMemo<PackingTask[]>(() => {
    const groups = new Map<string, PackingTask>();
    for (const sh of activeShipments) {
      const taskNo = sh.assignmentNo?.trim() || sh.assignmentId?.trim() || sh.id;
      const groupKey = `${sh.legalEntityId}::${sh.assignmentId ?? sh.assignmentNo ?? sh.id}`;
      const mpLabel = sh.marketplace === "wb" ? "WB" : sh.marketplace === "ozon" ? "Ozon" : "Яндекс";
      const existing = groups.get(groupKey);
      if (!existing) {
        groups.set(groupKey, {
          key: groupKey,
          label: `Отгрузка №${taskNo} - ${mpLabel}`,
          legalEntityId: sh.legalEntityId,
          marketplaceLabel: mpLabel,
          shipments: [sh],
        });
      } else {
        existing.shipments.push(sh);
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [activeShipments]);

  const selectedTask = tasks.find((x) => x.key === selectedTaskKey) ?? null;
  const startedTask = tasks.find((x) => x.key === startedTaskKey) ?? null;

  const scanLines = React.useMemo<ScanLine[]>(() => {
    if (!startedTask) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    const lineMap = new Map<string, ScanLine>();
    for (const sh of startedTask.shipments) {
      const product = byProduct.get(sh.productId) ?? null;
      const article = (sh.importArticle || product?.supplierArticle || "").trim();
      const color = (sh.importColor || product?.color || "").trim();
      const size = (sh.importSize || product?.size || "").trim();
      const barcode = (sh.importBarcode || product?.barcode || "").trim();
      const lineKey = `${article}|${color}|${size}|${barcode}`;
      const existing = lineMap.get(lineKey);
      const plan = Number(sh.plannedUnits) || 0;
      const fact = Number(sh.packedUnits ?? sh.shippedUnits ?? 0) || 0;
      if (!existing) {
        lineMap.set(lineKey, {
          key: lineKey,
          barcode,
          article,
          color,
          size,
          plan,
          fact,
          shipmentRefs: [{ shipmentId: sh.id, plan, fact }],
        });
      } else {
        existing.plan += plan;
        existing.fact += fact;
        existing.shipmentRefs.push({ shipmentId: sh.id, plan, fact });
      }
    }
    return Array.from(lineMap.values()).sort((a, b) => a.article.localeCompare(b.article, "ru"));
  }, [startedTask, catalog]);

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code || !startedTask) return;
    const line = scanLines.find((x) => x.barcode && x.barcode === code && x.fact < x.plan);
    if (!line) {
      toast.error("Штрихкод не найден в задании или план уже выполнен.");
      return;
    }
    const target = line.shipmentRefs.find((r) => r.fact < r.plan);
    if (!target) {
      toast.error("Для позиции нет доступного остатка по плану.");
      return;
    }
    const shipment = startedTask.shipments.find((x) => x.id === target.shipmentId);
    if (!shipment) return;
    setIsSubmittingScan(true);
    try {
      const nextFact = (shipment.packedUnits ?? shipment.shippedUnits ?? 0) + 1;
      await updateOutboundDraft({
        id: shipment.id,
        patch: {
          packedUnits: nextFact,
          shippedUnits: nextFact,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
      setScanValue("");
      toast.success(`Пик принят: ${line.article || line.barcode}`);
    } finally {
      setIsSubmittingScan(false);
    }
  };

  React.useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    const onFocus = () => void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  React.useEffect(() => {
    if (selectedTaskKey && !tasks.some((t) => t.key === selectedTaskKey)) {
      setSelectedTaskKey("");
    }
    if (startedTaskKey && !tasks.some((t) => t.key === startedTaskKey)) {
      setStartedTaskKey(null);
    }
  }, [tasks, selectedTaskKey, startedTaskKey]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Рабочее место упаковщика</h2>
        <p className="mt-1 text-sm text-slate-600">Изолированный модуль физической упаковки и сканирования отгрузок.</p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Выберите задание на отгрузку</CardTitle>
          <CardDescription>Только актуальные задания из раздела «Юрлица / Отгрузки».</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить список отгрузок.</p>
          ) : (
            <>
              <Select value={selectedTaskKey} onValueChange={setSelectedTaskKey}>
                <SelectTrigger className="w-full max-w-2xl">
                  <SelectValue placeholder={tasks.length ? "Выберите отгрузку" : "Активных отгрузок нет"} />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {tasks.map((row) => {
                    const labelEntity = legal?.find((x) => x.id === row.legalEntityId)?.shortName ?? row.legalEntityId;
                    return (
                      <SelectItem key={row.key} value={row.key}>
                        {row.label} · {labelEntity}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">{selectedTask ? `Выбрано: ${selectedTask.label}` : "Задание не выбрано"}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedTask
                    ? `${selectedTask.shipments.length} поз. в задании`
                    : "Выберите задание, чтобы перейти к следующему шагу упаковки."}
                </p>
              </div>

              <Button size="lg" className="h-12 w-full max-w-sm text-base" disabled={!selectedTask} onClick={() => setStartedTaskKey(selectedTask?.key ?? null)}>
                Начать упаковку
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {startedTask ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Режим сканирования</CardTitle>
            <CardDescription>{startedTask.label}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Введите штрихкод товара"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyScan();
                  }
                }}
              />
              <Button onClick={() => void applyScan()} disabled={!scanValue.trim() || isSubmittingScan || isUpdatingOutboundDraft}>
                {isSubmittingScan || isUpdatingOutboundDraft ? "Обработка..." : "Пикнуть"}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-r px-3 py-2 text-left font-medium">Артикул</th>
                    <th className="border-b border-r px-3 py-2 text-left font-medium">Цвет</th>
                    <th className="border-b border-r px-3 py-2 text-left font-medium">Размер</th>
                    <th className="border-b border-r px-3 py-2 text-right font-medium">План</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Факт</th>
                  </tr>
                </thead>
                <tbody>
                  {scanLines.map((line) => (
                    <tr key={line.key} className="odd:bg-white even:bg-slate-50/50">
                      <td className="border-b border-r px-3 py-2">{line.article || "—"}</td>
                      <td className="border-b border-r px-3 py-2">{line.color || "—"}</td>
                      <td className="border-b border-r px-3 py-2">{line.size || "—"}</td>
                      <td className="border-b border-r px-3 py-2 text-right tabular-nums">{line.plan}</td>
                      <td className="border-b px-3 py-2 text-right tabular-nums">{line.fact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default PackingPage;
