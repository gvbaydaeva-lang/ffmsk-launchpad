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
import TaskRegistryTable from "@/components/app/TaskRegistryTable";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { InboundSupply, Marketplace, TaskWorkflowStatus } from "@/types/domain";
import {
  taskWorkflowActionButtonClass,
  taskWorkflowActionLabel,
  workflowFromInbound,
} from "@/lib/taskWorkflowUi";
import { toast } from "sonner";

const ReceivingPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, updateInboundDraft, setInboundStatus, isUpdatingInboundDraft, isUpdatingInbound } = useInboundSupplies();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus>("all");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [startedSupplyId, setStartedSupplyId] = React.useState<string | null>(null);

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
    return [...filtered].sort((a, b) => (Date.parse(b.eta || "") || 0) - (Date.parse(a.eta || "") || 0));
  }, [data, mp, legalEntityId, search, entityName, statusFilter, warehouseFilter, dateFrom, dateTo]);
  const warehouses = React.useMemo(() => Array.from(new Set(rows.map((x) => x.destinationWarehouse))).filter(Boolean), [rows]);
  const startedSupply = rows.find((r) => r.id === startedSupplyId) ?? null;
  const receivingStarted = startedSupply ? workflowFromInbound(startedSupply) === "processing" : false;

  const totals = React.useMemo(() => {
    if (!startedSupply) return { plan: 0, fact: 0, done: false };
    const plan = startedSupply.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
    const fact = startedSupply.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
    return { plan, fact, done: plan > 0 && plan === fact };
  }, [startedSupply]);

  const mutateItemFact = async (supply: InboundSupply, index: number, value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    const nextItems = supply.items.map((item, idx) => (idx === index ? { ...item, factualQuantity: nextValue } : item));
    await updateInboundDraft({ id: supply.id, items: nextItems });
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
      await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
    } catch {
      toast.error("Не удалось запустить приёмку.");
    }
  };

  const closeReceiving = async () => {
    if (!startedSupply || !totals.done) return;
    try {
      await updateInboundDraft({ id: startedSupply.id, items: startedSupply.items, workflowStatus: "completed" });
      await setInboundStatus({ id: startedSupply.id, status: "принято", receivedUnits: totals.fact });
      await queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
      setStartedSupplyId(null);
      toast.success("Приёмка закрыта и убрана из активных.");
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

  React.useEffect(() => {
    if (startedSupplyId && !rows.some((r) => r.id === startedSupplyId)) {
      setStartedSupplyId(null);
    }
  }, [rows, startedSupplyId]);


  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-slate-600">Входящие поставки по маркетплейсам и юрлицам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

      {!startedSupply ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg text-slate-900">Очередь на приёмку</CardTitle>
            <CardDescription className="text-slate-500">Нажмите «Взять в работу», чтобы открыть документ.</CardDescription>
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
              <p className="text-sm text-slate-600">Нет документов приёмки.</p>
            ) : (
              <TaskRegistryTable
                rows={rows.map((supply) => {
                  const plan = supply.items.reduce((sum, item) => sum + (Number(item.plannedQuantity) || 0), 0);
                  const fact = supply.items.reduce((sum, item) => sum + (Number(item.factualQuantity) || 0), 0);
                  const wf = workflowFromInbound(supply);
                  return {
                    id: supply.id,
                    createdAtLabel: supply.eta ? format(parseISO(supply.eta), "dd.MM.yyyy HH:mm", { locale: ru }) : "—",
                    taskNo: supply.documentNo,
                    legalEntityLabel: entityName(supply.legalEntityId),
                    status: wf,
                    warehouseLabel: supply.destinationWarehouse,
                    marketplaceLabel: supply.marketplace.toUpperCase(),
                    plan,
                    fact,
                    isNew: wf === "pending",
                    mismatch: wf === "completed" && plan !== fact,
                  };
                })}
                onOpen={(id) => {
                  const supply = rows.find((x) => x.id === id);
                  if (!supply) return;
                  void startReceiving(supply);
                }}
                onAction={(id) => {
                  const supply = rows.find((x) => x.id === id);
                  if (!supply) return;
                  void startReceiving(supply);
                }}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {startedSupply ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg text-slate-900">Документ {startedSupply.documentNo}</CardTitle>
            <CardDescription>{entityName(startedSupply.legalEntityId)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900">Принято {totals.fact} из {totals.plan}</span>
                <span className="text-slate-600">{totals.plan > 0 ? Math.round((totals.fact / totals.plan) * 100) : 0}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${totals.plan > 0 ? Math.min(100, Math.round((totals.fact / totals.plan) * 100)) : 0}%` }}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-r px-3 py-2 text-left font-medium">Артикул</th>
                    <th className="border-b border-r px-3 py-2 text-left font-medium">Наименование</th>
                    <th className="border-b border-r px-3 py-2 text-right font-medium">План</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Факт</th>
                  </tr>
                </thead>
                <tbody>
                  {startedSupply.items.map((item, index) => (
                    <tr key={`${startedSupply.id}-${item.barcode}-${index}`} className="odd:bg-white even:bg-slate-50/50">
                      <td className="border-b border-r px-3 py-2">{item.supplierArticle || "—"}</td>
                      <td className="border-b border-r px-3 py-2">{item.name || item.barcode || "—"}</td>
                      <td className="border-b border-r px-3 py-2 text-right tabular-nums">{item.plannedQuantity}</td>
                      <td className="border-b px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={item.factualQuantity}
                          disabled={!receivingStarted || isUpdatingInboundDraft}
                          className="h-9 text-right tabular-nums"
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            void mutateItemFact(startedSupply, index, value);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!receivingStarted && workflowFromInbound(startedSupply) !== "completed" ? (
              <Button
                type="button"
                variant="ghost"
                className={taskWorkflowActionButtonClass("pending")}
                onClick={() => void startReceiving(startedSupply)}
                disabled={isUpdatingInbound}
              >
                {taskWorkflowActionLabel("pending")}
              </Button>
            ) : null}
            {receivingStarted && totals.done ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full max-w-sm rounded-lg bg-emerald-600 font-semibold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => void closeReceiving()}
                disabled={isUpdatingInbound}
              >
                Закрыть приёмку
              </Button>
            ) : null}
            {workflowFromInbound(startedSupply) === "completed" ? (
              <Button type="button" variant="ghost" className={taskWorkflowActionButtonClass("completed")} disabled>
                {taskWorkflowActionLabel("completed")}
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 w-full max-w-sm" onClick={() => setStartedSupplyId(null)}>
              Вернуться к списку заданий
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default ReceivingPage;
