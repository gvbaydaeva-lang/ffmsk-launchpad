import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import type { OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { toast } from "sonner";

type PackingAssignment = { id: string; display: string; legalEntityId: string; shipments: OutboundShipment[]; workflowStatus: TaskWorkflowStatus };

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
  const { data: outbound, isLoading, error, updateOutboundDraft, setOutboundStatus, isUpdatingOutboundDraft, isUpdatingOutbound } =
    useOutboundShipments();
  useInboundSupplies();
  const { data: catalog } = useProductCatalog();
  const { data: legal } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const queryClient = useQueryClient();
  const [startedAssignmentId, setStartedAssignmentId] = React.useState<string | null>(null);
  const [scanValue, setScanValue] = React.useState("");
  const [isSubmittingScan, setIsSubmittingScan] = React.useState(false);
  const [flashState, setFlashState] = React.useState<"ok" | "error" | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);

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
          workflowStatus: (sh.workflowStatus ?? "pending") as TaskWorkflowStatus,
        });
      } else {
        existing.shipments.push(sh);
        if ((sh.workflowStatus ?? "pending") === "processing") {
          existing.workflowStatus = "processing";
        }
      }
    }
    return Array.from(groups.values())
      .map((group) => {
        const allCompleted = group.shipments.every((sh) => (sh.workflowStatus ?? "pending") === "completed");
        return { ...group, workflowStatus: allCompleted ? "completed" : group.workflowStatus };
      })
      .filter((group) => group.workflowStatus !== "completed")
      .sort((a, b) => a.display.localeCompare(b.display, "ru"));
  }, [allShipments, legal]);

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

  const progress = React.useMemo(() => {
    const totalPlan = scanLines.reduce((sum, line) => sum + line.plan, 0);
    const totalFact = scanLines.reduce((sum, line) => sum + line.fact, 0);
    return { totalPlan, totalFact, percent: totalPlan > 0 ? Math.min(100, Math.round((totalFact / totalPlan) * 100)) : 0 };
  }, [scanLines]);

  const triggerFlash = React.useCallback((kind: "ok" | "error") => {
    setFlashState(kind);
    window.setTimeout(() => setFlashState(null), 500);
  }, []);

  const playErrorSignal = React.useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 220;
      gain.gain.value = 0.1;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      window.setTimeout(() => {
        oscillator.stop();
        void ctx.close();
      }, 120);
    } catch {
      // ignore audio errors in restricted browser environments
    }
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
    const line = scanLines.find((x) => x.barcode && x.barcode === code && x.fact < x.plan);
    if (!line) {
      triggerFlash("error");
      playErrorSignal();
      toast.error("Штрихкод не найден в задании или план уже выполнен.");
      focusScanInput();
      return;
    }
    const target = line.shipmentRefs.find((r) => r.fact < r.plan);
    if (!target) {
      triggerFlash("error");
      playErrorSignal();
      toast.error("Для позиции нет доступного остатка по плану.");
      focusScanInput();
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
      triggerFlash("ok");
      focusScanInput();
      toast.success(`Пик принят: ${line.article || line.barcode}`);
    } finally {
      setIsSubmittingScan(false);
    }
  };

  const finalizeAssignment = async () => {
    if (!startedAssignment || progress.totalPlan === 0 || progress.totalPlan !== progress.totalFact) return;
    try {
      for (const sh of startedAssignment.shipments) {
        const plan = Number(sh.plannedUnits) || 0;
        await updateOutboundDraft({
          id: sh.id,
          patch: { packedUnits: plan, shippedUnits: plan, workflowStatus: "completed" },
        });
        await setOutboundStatus({ id: sh.id, status: "отгружено", shippedUnits: plan });
      }
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
      toast.success("Задание завершено и убрано из активных.");
      setStartedAssignmentId(null);
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
    if (startedAssignmentId && !assignments.some((t) => t.id === startedAssignmentId)) {
      setStartedAssignmentId(null);
    }
  }, [assignments, startedAssignmentId]);

  React.useEffect(() => {
    if (startedAssignment) focusScanInput();
  }, [startedAssignment, focusScanInput]);

  const startAssignment = async (assignment: PackingAssignment) => {
    if (assignment.workflowStatus === "pending") {
      for (const sh of assignment.shipments) {
        await updateOutboundDraft({ id: sh.id, patch: { workflowStatus: "processing", status: "к отгрузке" } });
      }
      await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    }
    setStartedAssignmentId(assignment.id);
  };

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

      <GlobalFiltersBar />

      {!startedAssignment ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Очередь заданий на отгрузку</CardTitle>
            <CardDescription>Выберите документ и возьмите его в сборку.</CardDescription>
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
              <p className="text-sm text-slate-600">Активных заданий нет.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {assignments.map((assignment) => {
                  const first = assignment.shipments[0];
                  const assignmentNo = first?.assignmentNo?.trim() || first?.assignmentId?.trim() || first?.id || "—";
                  const legalName = legal?.find((x) => x.id === assignment.legalEntityId)?.shortName ?? assignment.legalEntityId;
                  const dateLabel = first?.createdAt ? format(parseISO(first.createdAt), "dd.MM.yyyy", { locale: ru }) : "без даты";
                  const totalPlan = assignment.shipments.reduce((sum, sh) => sum + (Number(sh.plannedUnits) || 0), 0);
                  return (
                    <Card
                      key={assignment.id}
                      className={assignment.workflowStatus === "processing" ? "border-sky-200 bg-sky-50/40" : "border-slate-200"}
                    >
                      <CardHeader className="space-y-2 pb-2">
                        <CardTitle className="text-base">№ {assignmentNo}</CardTitle>
                        <CardDescription>{legalName}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm text-slate-600">
                          <p>Дата: {dateLabel}</p>
                          <p>Товаров по плану: {totalPlan}</p>
                        </div>
                        <Button className="h-11 w-full text-base" onClick={() => void startAssignment(assignment)}>
                          {assignment.workflowStatus === "processing" ? "Продолжить сборку" : "Взять в сборку"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {startedAssignment ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Режим сканирования</CardTitle>
            <CardDescription>{startedAssignment.display}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={scanInputRef}
                placeholder="Введите штрихкод товара"
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
              <Button onClick={() => void applyScan()} disabled={!scanValue.trim() || isSubmittingScan || isUpdatingOutboundDraft}>
                {isSubmittingScan || isUpdatingOutboundDraft ? "Обработка..." : "Пикнуть"}
              </Button>
            </div>
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900">Собрано {progress.totalFact} из {progress.totalPlan}</span>
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

            {progress.totalPlan > 0 && progress.totalPlan === progress.totalFact ? (
              <Button
                className="h-11 w-full max-w-sm"
                onClick={() => void finalizeAssignment()}
                disabled={isUpdatingOutboundDraft || isUpdatingOutbound}
              >
                Завершить отгрузку
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 w-full max-w-sm" onClick={() => setStartedAssignmentId(null)}>
              Вернуться к списку заданий
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default PackingPage;
