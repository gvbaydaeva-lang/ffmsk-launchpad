import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import type { OutboundShipment } from "@/types/domain";
import { toast } from "sonner";

type PackingAssignment = { id: string; display: string; legalEntityId: string; shipments: OutboundShipment[] };

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
  useInboundSupplies();
  const { data: catalog } = useProductCatalog();
  const { data: legal } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const queryClient = useQueryClient();
  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState("");
  const [startedAssignmentId, setStartedAssignmentId] = React.useState<string | null>(null);
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);

  const allShipments = React.useMemo(() => {
    const rows = outbound ?? [];
    return rows
      .filter((x) => legalEntityId === "all" || x.legalEntityId === legalEntityId)
      .sort((a, b) => (a.assignmentNo || a.id).localeCompare(b.assignmentNo || b.id, "ru"));
  }, [outbound, legalEntityId]);

  const assignments = React.useMemo<PackingAssignment[]>(() => {
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
        });
      } else {
        existing.shipments.push(sh);
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.display.localeCompare(b.display, "ru"));
  }, [allShipments, legal]);

  const selectedAssignment = assignments.find((x) => x.id === selectedAssignmentId) ?? null;
  const startedAssignment = assignments.find((x) => x.id === startedAssignmentId) ?? null;

  const scanLines = React.useMemo<ScanLine[]>(() => {
    if (!startedAssignment) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    const lineMap = new Map<string, ScanLine>();
    for (const sh of startedAssignment.shipments) {
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
  }, [startedAssignment, catalog]);

  const applyScan = async () => {
    const code = scanValue.trim();
    if (!code || !startedAssignment) return;
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
    const shipment = startedAssignment.shipments.find((x) => x.id === target.shipmentId);
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
    if (selectedAssignmentId && !assignments.some((t) => t.id === selectedAssignmentId)) {
      setSelectedAssignmentId("");
    }
    if (startedAssignmentId && !assignments.some((t) => t.id === startedAssignmentId)) {
      setStartedAssignmentId(null);
    }
  }, [assignments, selectedAssignmentId, startedAssignmentId]);

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
          <CardDescription>Показываются все задания из общего списка отгрузок (Query Key: ["wms", "outbound"]).</CardDescription>
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
              <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                <SelectTrigger className="w-full max-w-2xl">
                  <SelectValue placeholder={assignments.length ? "Выберите отгрузку" : "Заданий нет"} />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {assignments.map((row) => {
                    return (
                      <SelectItem key={row.id} value={row.id}>
                        {row.display}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">{selectedAssignment ? `Выбрано: ${selectedAssignment.display}` : "Задание не выбрано"}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedAssignment
                    ? `${selectedAssignment.shipments.length} поз. в задании`
                    : "Выберите задание, чтобы перейти к следующему шагу упаковки."}
                </p>
              </div>

              <Button
                size="lg"
                className="h-12 w-full max-w-sm text-base"
                disabled={!selectedAssignment}
                onClick={() => setStartedAssignmentId(selectedAssignmentId)}
              >
                Начать упаковку
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {startedAssignment ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Режим сканирования</CardTitle>
            <CardDescription>{startedAssignment.display}</CardDescription>
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
