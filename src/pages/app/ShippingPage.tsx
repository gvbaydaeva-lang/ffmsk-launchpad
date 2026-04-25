import * as React from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import TaskRegistryTable from "@/components/app/TaskRegistryTable";
import ShippingTaskWorkScreen from "@/components/app/ShippingTaskWorkScreen";
import { Button } from "@/components/ui/button";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";

type ShipmentDoc = {
  id: string;
  legalEntityId: string;
  assignmentNo: string;
  createdAt: string;
  sourceWarehouse: string;
  marketplace: Marketplace;
  planned: number;
  fact: number;
  shipments: OutboundShipment[];
  workflowStatus: TaskWorkflowStatus;
};

const ShippingPage = () => {
  const { data, isLoading, error } = useOutboundShipments();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskWorkflowStatus>("all");
  const [viewMode, setViewMode] = React.useState<"active" | "archive">("active");
  const [warehouseFilter, setWarehouseFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const base = filterOutboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((x) => x.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);

  const documents = React.useMemo(() => {
    const groups = new Map<string, OutboundShipment[]>();
    for (const x of filtered) {
      const key = `${x.legalEntityId}::${x.assignmentId ?? x.assignmentNo ?? x.id}`;
      const cur = groups.get(key) ?? [];
      cur.push(x);
      groups.set(key, cur);
    }
    const docs: ShipmentDoc[] = [];
    for (const [groupId, shipments] of groups) {
      const first = shipments[0];
      const createdAt = shipments.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), first.createdAt);
      const planned = shipments.reduce((s, sh) => s + (Number(sh.plannedUnits) || 0), 0);
      const fact = shipments.reduce((s, sh) => s + (Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0), 0);
      const workflowStatus = workflowFromOutboundGroup(shipments);
      docs.push({
        id: groupId,
        legalEntityId: first.legalEntityId,
        assignmentNo: first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id,
        createdAt,
        sourceWarehouse: first.sourceWarehouse,
        marketplace: first.marketplace,
        planned,
        fact,
        shipments,
        workflowStatus,
      });
    }
    const q = search.trim().toLowerCase();
    const searched = !q
      ? docs
      : docs.filter((d) => {
          const entity = entities?.find((e) => e.id === d.legalEntityId)?.shortName ?? d.legalEntityId;
          const lines = d.shipments
            .map((s) => `${s.importArticle ?? ""} ${s.importBarcode ?? ""} ${s.importName ?? ""}`)
            .join(" ")
            .toLowerCase();
          return `${entity} ${d.assignmentNo} ${lines}`.toLowerCase().includes(q);
        });
    const withFilters = searched.filter((d) => {
      if (viewMode === "active" && d.workflowStatus === "completed") return false;
      if (viewMode === "archive" && d.workflowStatus !== "completed") return false;
      if (statusFilter !== "all" && d.workflowStatus !== statusFilter) return false;
      if (warehouseFilter !== "all" && d.sourceWarehouse !== warehouseFilter) return false;
      const created = Date.parse(d.createdAt || "");
      if (dateFrom) {
        const from = Date.parse(`${dateFrom}T00:00:00`);
        if (Number.isFinite(from) && created < from) return false;
      }
      if (dateTo) {
        const to = Date.parse(`${dateTo}T23:59:59`);
        if (Number.isFinite(to) && created > to) return false;
      }
      return true;
    });
    return withFilters.sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0));
  }, [filtered, search, entities, viewMode, statusFilter, warehouseFilter, dateFrom, dateTo]);

  const selectedDoc = documents.find((x) => x.id === selectedId) ?? null;
  const warehouses = React.useMemo(() => Array.from(new Set(documents.map((d) => d.sourceWarehouse))).filter(Boolean), [documents]);
  const toggleSelectedDoc = React.useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-4">
      {!selectedDoc ? (
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Задания на выдачу со склада FF и контроль остатков.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: №, юрлицо, артикул, баркод" className="w-[280px]" />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | TaskWorkflowStatus)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="pending">Новое</SelectItem>
              <SelectItem value="processing">В работе</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Склад" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {warehouses.map((wh) => <SelectItem key={wh} value={wh}>{wh}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
      </div>
      ) : (
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Просмотр выбранного задания.</p>
        </div>
      )}

      <GlobalFiltersBar />

      {!selectedDoc ? (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Реестр заданий на отгрузку</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-36 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить отгрузки.</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-600">
              {viewMode === "active" ? "Нет активных заданий для отображения." : "Архив отгрузок пуст."}
            </p>
          ) : (
            <TaskRegistryTable
              rows={documents.map((doc) => ({
                id: doc.id,
                createdAtLabel: doc.createdAt ? format(parseISO(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: ru }) : "—",
                taskNo: doc.assignmentNo,
                legalEntityLabel: entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId,
                status: doc.workflowStatus,
                warehouseLabel: doc.sourceWarehouse,
                marketplaceLabel: doc.marketplace.toUpperCase(),
                plan: doc.planned,
                fact: doc.fact,
                isNew: doc.workflowStatus === "pending",
                mismatch: doc.planned !== doc.fact && doc.workflowStatus === "completed",
              }))}
              selectedId={selectedId}
              actionLabel="Открыть"
              disableActionForCompleted={false}
              onOpen={toggleSelectedDoc}
              onAction={toggleSelectedDoc}
            />
          )}
        </CardContent>
      </Card>
      ) : null}

      {selectedDoc ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/legal-entities/${selectedDoc.legalEntityId}?tab=shipping`}>Открыть в карточке юрлица</Link>
            </Button>
          </div>
          <ShippingTaskWorkScreen
            assignmentNo={selectedDoc.assignmentNo}
            legalEntityName={entities?.find((e) => e.id === selectedDoc.legalEntityId)?.shortName ?? selectedDoc.legalEntityId}
            warehouseName={selectedDoc.sourceWarehouse}
            createdAt={selectedDoc.createdAt}
            status={selectedDoc.workflowStatus}
            plan={selectedDoc.planned}
            fact={selectedDoc.fact}
            rows={selectedDoc.shipments.map((sh) => ({
              id: sh.id,
              name: sh.importName || "—",
              article: sh.importArticle || "—",
              barcode: sh.importBarcode || "—",
              marketplace: sh.marketplace.toUpperCase(),
              color: sh.importColor || "—",
              size: sh.importSize || "—",
              plan: Number(sh.plannedUnits) || 0,
              fact: Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0,
              warehouse: sh.sourceWarehouse || "—",
              status: sh.workflowStatus ?? "pending",
            }))}
            onBack={() => setSelectedId(null)}
          />
        </div>
      ) : null}
    </div>
  );
};

export default ShippingPage;
