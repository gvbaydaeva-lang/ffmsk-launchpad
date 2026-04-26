import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import TaskRegistryTable from "@/components/app/TaskRegistryTable";
import ReceivingTaskWorkScreen from "@/components/app/ReceivingTaskWorkScreen";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useAppendOperationLog, useInboundSupplies, useInventoryMovements, useLegalEntities } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { InboundSupply, InventoryMovement, Marketplace, TaskWorkflowStatus } from "@/types/domain";
import { workflowFromInbound } from "@/lib/taskWorkflowUi";
import {
  formatTaskArchiveDateLabel,
  inboundArchiveSortKey,
  inboundSupplyCompletedAtIso,
  inboundSupplyCreatedAtIso,
} from "@/lib/taskArchiveDates";
import { hasReceivingInboundMovements } from "@/services/mockInventoryMovements";
import { buildInboundReceivingInventoryMovements } from "@/lib/inventoryMovementsFromInbound";
import { toast } from "sonner";

const ReceivingPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, updateInboundDraft, setInboundStatus, isUpdatingInboundDraft, isUpdatingInbound } = useInboundSupplies();
  const { addInventoryMovements, data: movementRows } = useInventoryMovements();
  const { data: entities } = useLegalEntities();
  const appendOperationLog = useAppendOperationLog();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus>("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [startedSupplyId, setStartedSupplyId] = React.useState<string | null>(null);
  const [receivingArchivePeekId, setReceivingArchivePeekId] = React.useState<string | null>(null);

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    const base = filterInboundByMarketplace(data ?? [], mp);
    const byEntity = legalEntityId === "all" ? base : base.filter((r) => r.legalEntityId === legalEntityId);
    const q = search.trim().toLowerCase();
    const searched = !q
      ? byEntity
      : byEntity.filter((r) => {
          const lineText = r.items.map((it) => `${it.supplierArticle} ${it.barcode}`).join(" ").toLowerCase();
          const label = `${r.documentNo} ${entityName(r.legalEntityId)} ${r.supplier} ${lineText}`.toLowerCase();
          return label.includes(q);
        });
    const filtered = searched.filter((r) => {
      const wf = workflowFromInbound(r);
      if (viewMode === "active" && wf === "completed") return false;
      if (viewMode === "archive" && wf !== "completed") return false;
      if (statusFilter !== "all" && wf !== statusFilter) return false;
      if (warehouseFilter !== "all" && r.destinationWarehouse !== warehouseFilter) return false;
      const dt = Date.parse(r.eta || "");
      if (dateFrom) {
        const from = Date.parse(`${dateFrom}T00:00:00`);
        if (Number.isFinite(from) && dt < from) return false;
      }
      if (dateTo) {
        const to = Date.parse(`${dateTo}T23:59:59`);
        if (Number.isFinite(to) && dt > to) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (viewMode === "archive") {
        return inboundArchiveSortKey(b) - inboundArchiveSortKey(a);
      }
      return (Date.parse(b.eta || "") || 0) - (Date.parse(a.eta || "") || 0);
    });
  }, [data, mp, legalEntityId, search, entityName, viewMode, statusFilter, warehouseFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    setReceivingArchivePeekId(null);
  }, [viewMode]);
  const warehouses = React.useMemo(() => Array.from(new Set(rows.map((x) => x.destinationWarehouse))).filter(Boolean), [rows]);
  const startedSupply =
    startedSupplyId == null ? null : ((data ?? []).find((d) => d.id === startedSupplyId) ?? null);
  const receivingWorkOpen = startedSupplyId != null;

  const mutateItemFact = async (supply: InboundSupply, index: number, value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    const nextItems = supply.items.map((item, idx) => (idx === index ? { ...item, factualQuantity: nextValue } : item));
    await updateInboundDraft({ id: supply.id, items: nextItems });
    await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
  };

  const saveSupplyItems = async (supply: InboundSupply, items: InboundSupply["items"]) => {
    await updateInboundDraft({ id: supply.id, items });
    await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
  };

  const startReceiving = async (supply: InboundSupply) => {
    const wf = workflowFromInbound(supply);
    if (wf === "completed") return;
    if (wf === "processing") {
      setStartedSupplyId(supply.id);
      return;
    }
    try {
      await setInboundStatus({ id: supply.id, status: "на приёмке" });
      await updateInboundDraft({ id: supply.id, items: supply.items, workflowStatus: "processing" });
      setStartedSupplyId(supply.id);
      appendOperationLog({
        type: "RECEIVING_STARTED",
        legalEntityId: supply.legalEntityId,
        legalEntityName: entityName(supply.legalEntityId),
        taskId: supply.id,
        taskNumber: supply.documentNo,
        description: `Приёмка №${supply.documentNo} взята в работу`,
      });
      await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
    } catch {
      toast.error("Не удалось запустить приёмку.");
    }
  };

  const closeReceiving = async () => {
    if (!startedSupply) return;
    const latest = (data ?? []).find((r) => r.id === startedSupply.id) ?? startedSupply;
    if (workflowFromInbound(latest) === "completed") {
      setStartedSupplyId(null);
      return;
    }
    const plan = latest.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
    const fact = latest.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
    if (plan <= 0) return;
    const hasDiscrepancy = latest.items.some((it) => {
      const p = Number(it.plannedQuantity) || 0;
      const f = Number(it.factualQuantity) || 0;
      return p !== f;
    });
    const invSnapshot = (queryClient.getQueryData<InventoryMovement[]>(["wms", "inventory-movements"]) ?? movementRows) ?? [];
    try {
      if (!hasReceivingInboundMovements(latest.id, invSnapshot)) {
        const leName = entityName(latest.legalEntityId);
        const moves = buildInboundReceivingInventoryMovements(latest, leName);
        if (moves.length) {
          await addInventoryMovements(moves);
        }
      }
      await updateInboundDraft({
        id: latest.id,
        items: latest.items,
        workflowStatus: "completed",
        completedWithDiscrepancies: hasDiscrepancy,
      });
      await setInboundStatus({ id: latest.id, status: "принято", receivedUnits: fact });
      if (hasDiscrepancy) {
        appendOperationLog({
          type: "TASK_COMPLETED_WITH_MISMATCH",
          legalEntityId: latest.legalEntityId,
          legalEntityName: entityName(latest.legalEntityId),
          taskId: latest.id,
          taskNumber: latest.documentNo,
          description: `Задание завершено с расхождением`,
        });
      } else {
        appendOperationLog({
          type: "RECEIVING_COMPLETED",
          legalEntityId: latest.legalEntityId,
          legalEntityName: entityName(latest.legalEntityId),
          taskId: latest.id,
          taskNumber: latest.documentNo,
          description: `Приёмка №${latest.documentNo} завершена`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
      await queryClient.invalidateQueries({ queryKey: ["wms", "inventory-movements"] });
      setStartedSupplyId(null);
      if (hasDiscrepancy) {
        toast.warning("Приёмка закрыта с расхождениями", { description: "Проверьте план и факт по строкам." });
      } else {
        toast.success("Приёмка закрыта и убрана из активных.");
      }
    } catch {
      toast.error("Не удалось закрыть приёмку.");
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

  const handleBackToList = () => {
    setStartedSupplyId(null);
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-slate-600">Входящие поставки по маркетплейсам и юрлицам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: название, баркод, артикул"
            className="w-full sm:w-[280px]"
          />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[200px]">
              <SelectValue placeholder="Площадка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | TaskWorkflowStatus)}>
            <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">Новое</SelectItem>
              <SelectItem value="processing">В работе</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[190px]"><SelectValue placeholder="Склад" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {warehouses.map((wh) => <SelectItem key={wh} value={wh}>{wh}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-[150px]" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-[150px]" />
        </div>
      </div>

      <GlobalFiltersBar />

      {!receivingWorkOpen ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg text-slate-900">Очередь на приёмку</CardTitle>
            <CardDescription className="text-slate-500">
              {viewMode === "archive"
                ? "Архив завершённых приёмок. Кнопка «Открыть» — только просмотр состава."
                : "Нажмите «Взять в работу», чтобы открыть документ."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
              </div>
            ) : error ? (
              <p className="p-2 text-sm text-destructive">Не удалось загрузить список.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-slate-600">
                {viewMode === "active" ? "Нет активных документов приёмки." : "Архив приёмки пуст."}
              </p>
            ) : (
              <TaskRegistryTable
                archiveMode={viewMode === "archive"}
                disableActionForCompleted={viewMode !== "archive"}
                rows={rows.map((supply) => {
                  const plan = supply.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
                  const fact = supply.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
                  const wf = workflowFromInbound(supply);
                  const overrun = Math.max(0, fact - plan);
                  const requiresReview = plan > 0 && plan !== fact;
                  const mismatch =
                    wf === "completed" && (plan !== fact || Boolean(supply.completedWithDiscrepancies));
                  return {
                    id: supply.id,
                    createdAtLabel: formatTaskArchiveDateLabel(inboundSupplyCreatedAtIso(supply)),
                    completedAtLabel: formatTaskArchiveDateLabel(inboundSupplyCompletedAtIso(supply)),
                    taskNo: supply.documentNo,
                    legalEntityLabel: entityName(supply.legalEntityId),
                    status: wf,
                    warehouseLabel: supply.destinationWarehouse,
                    marketplaceLabel: supply.marketplace.toUpperCase(),
                    plan,
                    fact,
                    isNew: wf === "pending",
                    requiresReview,
                    mismatch,
                    overrun,
                  };
                })}
                onOpen={(id) => {
                  if (viewMode === "archive") {
                    setReceivingArchivePeekId((p) => (p === id ? null : id));
                    return;
                  }
                  const supply = rows.find((x) => x.id === id);
                  if (!supply) return;
                  void startReceiving(supply);
                }}
                onAction={(id) => {
                  if (viewMode === "archive") {
                    setReceivingArchivePeekId((p) => (p === id ? null : id));
                    return;
                  }
                  const supply = rows.find((x) => x.id === id);
                  if (!supply) return;
                  void startReceiving(supply);
                }}
              />
            )}
            {viewMode === "archive" && receivingArchivePeekId ? (
              (() => {
                const peek = rows.find((s) => s.id === receivingArchivePeekId) ?? (data ?? []).find((s) => s.id === receivingArchivePeekId);
                if (!peek) return null;
                const plan = peek.items.reduce((s, it) => s + (Number(it.plannedQuantity) || 0), 0);
                const fact = peek.items.reduce((s, it) => s + (Number(it.factualQuantity) || 0), 0);
                return (
                  <Card className="mt-3 border-slate-200 bg-slate-50/50 shadow-sm">
                    <CardHeader className="border-b border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">Состав задания №{peek.documentNo || "—"}</CardTitle>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setReceivingArchivePeekId(null)}>
                          Закрыть
                        </Button>
                      </div>
                      <CardDescription className="text-slate-600">Просмотр (архив)</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-3">
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
                            <th className="border-b px-2 py-1.5 text-right text-xs font-medium">Факт</th>
                          </tr>
                        </thead>
                        <tbody>
                          {peek.items.map((item, index) => (
                            <tr key={`${peek.id}-${item.barcode}-${index}`} className="odd:bg-white even:bg-slate-50/50">
                              <td className="border-b border-r px-2 py-1.5 text-xs">{item.name || "—"}</td>
                              <td className="border-b border-r px-2 py-1.5 text-xs">{item.supplierArticle || "—"}</td>
                              <td className="border-b border-r px-2 py-1.5 font-mono text-[11px]">{item.barcode || "—"}</td>
                              <td className="border-b border-r px-2 py-1.5 text-xs">{peek.marketplace.toUpperCase()}</td>
                              <td className="border-b border-r px-2 py-1.5 text-xs">{item.color || "—"}</td>
                              <td className="border-b border-r px-2 py-1.5 text-xs">{item.size || "—"}</td>
                              <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-xs">{Number(item.plannedQuantity) || 0}</td>
                              <td className="border-b px-2 py-1.5 text-right tabular-nums text-xs">{Number(item.factualQuantity) || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-slate-600">
                        План {plan} · Факт {fact}
                      </p>
                    </CardContent>
                  </Card>
                );
              })()
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {receivingWorkOpen && startedSupply ? (
        <ReceivingTaskWorkScreen
          key={startedSupplyId}
          supply={startedSupply}
          legalEntityName={entityName(startedSupply.legalEntityId)}
          isUpdatingInboundDraft={isUpdatingInboundDraft}
          isUpdatingInbound={isUpdatingInbound}
          onBack={handleBackToList}
          onStartReceiving={() => startReceiving(startedSupply)}
          onSaveItems={(items) => saveSupplyItems(startedSupply, items)}
          onComplete={() => closeReceiving()}
          onScanError={(code, kind) => {
            appendOperationLog({
              type: "SCAN_ERROR",
              legalEntityId: startedSupply.legalEntityId,
              legalEntityName: entityName(startedSupply.legalEntityId),
              taskId: startedSupply.id,
              taskNumber: startedSupply.documentNo,
              description:
                kind === "over"
                  ? `Ошибка: превышено количество по товару (штрихкод: ${code})`
                  : `Ошибка: товар не найден в задании (штрихкод: ${code})`,
            });
          }}
        />
      ) : null}

      {receivingWorkOpen && !startedSupply ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-slate-600">Документ не найден в данных. Вернитесь к списку.</p>
            <button
              type="button"
              className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
              onClick={handleBackToList}
            >
              назад к списку
            </button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default ReceivingPage;
