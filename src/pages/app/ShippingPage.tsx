import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import TaskItemsTable, { type TaskItemRow } from "@/components/app/TaskItemsTable";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/app/StatusBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { workflowFromOutboundGroup } from "@/lib/taskWorkflowUi";
import { formatTaskArchiveDateLabel, outboundArchiveSortKey, outboundShipmentsCompletedAtIso } from "@/lib/taskArchiveDates";

type ShipmentDoc = {
  id: string;
  legalEntityId: string;
  assignmentNo: string;
  createdAt: string;
  completedAtIso?: string;
  sourceWarehouse: string;
  marketplace: Marketplace;
  planned: number;
  fact: number;
  shipments: OutboundShipment[];
  workflowStatus: TaskWorkflowStatus;
};

function shippingDispatcherHint(status: TaskWorkflowStatus): string {
  if (status === "pending") return "Задание создано и ожидает сборки";
  if (status === "processing") return "Задание находится в сборке";
  return "Сборка завершена";
}

const ShippingPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, error } = useOutboundShipments();
  const { data: catalog } = useProductCatalog();
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
    for (const [, shipments] of groups) {
      const first = shipments[0];
      const createdAt = shipments.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), first.createdAt);
      const planned = shipments.reduce((s, sh) => s + (Number(sh.plannedUnits) || 0), 0);
      const fact = shipments.reduce((s, sh) => s + (Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0), 0);
      const workflowStatus = workflowFromOutboundGroup(shipments);
      const groupId = `${first.legalEntityId}::${first.assignmentId ?? first.assignmentNo ?? first.id}`;
      docs.push({
        id: groupId,
        legalEntityId: first.legalEntityId,
        assignmentNo: first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id,
        createdAt,
        completedAtIso: outboundShipmentsCompletedAtIso(shipments),
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
    return withFilters.sort((a, b) => {
      if (viewMode === "archive") {
        return outboundArchiveSortKey(b.shipments) - outboundArchiveSortKey(a.shipments);
      }
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
  }, [filtered, search, entities, viewMode, statusFilter, warehouseFilter, dateFrom, dateTo]);

  const selectedDoc = documents.find((x) => x.id === selectedId) ?? null;

  /** Строки отгрузки из хранилища часто без import* — подставляем поля из каталога по productId (как в упаковщике). */
  const selectedShipmentItemRows = React.useMemo<TaskItemRow[]>(() => {
    if (!selectedDoc?.shipments?.length) return [];
    const byProduct = new Map((catalog ?? []).map((p) => [p.id, p]));
    return selectedDoc.shipments.map((sh) => {
      const product = byProduct.get(sh.productId) ?? null;
      const name = (sh.importName || product?.name || "").trim() || "—";
      const article = (sh.importArticle || product?.supplierArticle || "").trim() || "—";
      const barcode = (sh.importBarcode || product?.barcode || "").trim() || "—";
      const color = (sh.importColor || product?.color || "").trim() || "—";
      const size = (sh.importSize || product?.size || "").trim() || "—";
      const plan = Number(sh.plannedUnits) || 0;
      const fact = Number(sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;
      return {
        id: sh.id,
        name,
        article,
        barcode,
        marketplace: sh.marketplace.toUpperCase(),
        color,
        size,
        plan,
        fact,
        warehouse: sh.sourceWarehouse || "—",
        status: sh.workflowStatus ?? "pending",
      };
    });
  }, [selectedDoc, catalog]);

  const warehouses = React.useMemo(() => Array.from(new Set(documents.map((d) => d.sourceWarehouse))).filter(Boolean), [documents]);

  const goToPacker = React.useCallback(
    (assignmentId: string) => {
      navigate(`/packing?openAssignment=${encodeURIComponent(assignmentId)}`);
    },
    [navigate],
  );

  return (
    <div className="space-y-4">
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

      <GlobalFiltersBar />

      <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Реестр заданий на отгрузку</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
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
            <>
              <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border border-slate-200">
                <Table className="min-w-[1200px] table-auto">
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата создания</TableHead>
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Дата завершения</TableHead>
                      <TableHead className="h-9 min-w-[140px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">№ задания</TableHead>
                      <TableHead className="h-9 min-w-[180px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                      <TableHead className="h-9 min-w-[130px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Статус</TableHead>
                      <TableHead className="h-9 min-w-[180px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Склад</TableHead>
                      <TableHead className="h-9 min-w-[120px] whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">Маркетплейс</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">План</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Факт</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Осталось</TableHead>
                      <TableHead className="h-9 whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Перерасход</TableHead>
                      <TableHead className="h-9 w-[110px] whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const rem = Math.max(0, doc.planned - doc.fact);
                      const over = Math.max(0, doc.fact - doc.planned);
                      const isSel = selectedId === doc.id;
                      const legalLabel = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
                      return (
                        <React.Fragment key={doc.id}>
                          <TableRow
                            className={`cursor-pointer border-slate-100 text-sm ${isSel ? "bg-slate-50" : ""} ${doc.workflowStatus === "pending" ? "bg-blue-50/60" : ""}`}
                            onClick={() => setSelectedId(doc.id)}
                          >
                            <TableCell className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {doc.createdAt ? format(parseISO(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: ru }) : "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                              {formatTaskArchiveDateLabel(doc.completedAtIso)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 font-medium">{doc.assignmentNo}</TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2">{legalLabel}</TableCell>
                            <TableCell className="px-3 py-2">
                              <StatusBadge status={doc.workflowStatus} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2">{doc.sourceWarehouse}</TableCell>
                            <TableCell className="px-3 py-2">{doc.marketplace.toUpperCase()}</TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{doc.planned}</TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{doc.fact}</TableCell>
                            <TableCell
                              className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                doc.planned > doc.fact ? "font-medium text-amber-800" : doc.planned < doc.fact ? "font-medium text-red-700" : ""
                              }`}
                            >
                              {rem}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${over > 0 ? "font-medium text-red-700" : ""}`}>
                              {over}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 hover:bg-slate-50"
                                onClick={() => setSelectedId((p) => (p === doc.id ? null : doc.id))}
                              >
                                Открыть
                              </button>
                            </TableCell>
                          </TableRow>
                          {isSel ? (
                            <TableRow className="border-slate-100 bg-slate-50/90">
                              <TableCell colSpan={12} className="align-top p-0">
                                <div className="space-y-4 border-t border-slate-200 p-4">
                                  <div>
                                    <h3 className="font-display text-base font-semibold text-slate-900">Задание №{doc.assignmentNo}</h3>
                                    <p className="mt-1 text-sm text-slate-600">{shippingDispatcherHint(doc.workflowStatus)}</p>
                                  </div>
                                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                      <span className="text-slate-500">Юрлицо</span>
                                      <div className="font-medium text-slate-900">{legalLabel}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Склад</span>
                                      <div className="font-medium text-slate-900">{doc.sourceWarehouse}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Статус</span>
                                      <div className="mt-0.5">
                                        <StatusBadge status={doc.workflowStatus} />
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">МП</span>
                                      <div className="font-medium text-slate-900">{doc.marketplace.toUpperCase()}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">План</span>
                                      <div className="font-medium tabular-nums text-slate-900">{doc.planned}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Факт</span>
                                      <div className="font-medium tabular-nums text-slate-900">{doc.fact}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Осталось</span>
                                      <div className={`font-medium tabular-nums ${rem > 0 ? "text-amber-800" : "text-slate-900"}`}>{rem}</div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Перерасход</span>
                                      <div className={`font-medium tabular-nums ${over > 0 ? "text-red-700" : "text-slate-900"}`}>{over}</div>
                                    </div>
                                  </div>
                                  {(doc.planned > doc.fact || doc.fact > doc.planned) && (
                                    <div className="flex flex-wrap gap-3 text-sm">
                                      {doc.planned > doc.fact ? (
                                        <span className="font-medium text-amber-800">Осталось: {rem}</span>
                                      ) : null}
                                      {doc.fact > doc.planned ? <span className="font-medium text-red-700">Перерасход: {over}</span> : null}
                                    </div>
                                  )}
                                  {viewMode === "archive" ? null : (
                                    <div className="flex flex-wrap items-center gap-2">
                                      {doc.workflowStatus === "completed" ? (
                                        <Button type="button" size="sm" variant="secondary" disabled>
                                          Сборка завершена
                                        </Button>
                                      ) : doc.workflowStatus === "processing" ? (
                                        <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                          Продолжить сборку
                                        </Button>
                                      ) : (
                                        <Button type="button" size="sm" onClick={() => goToPacker(doc.id)}>
                                          Открыть в упаковщике
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <p className="mb-2 text-xs font-medium text-slate-600">Состав задания</p>
                                    {selectedShipmentItemRows.length === 0 ? (
                                      <p className="text-sm text-slate-600">Состав задания не найден</p>
                                    ) : (
                                      <TaskItemsTable variant="outboundLines" rows={selectedShipmentItemRows} />
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ShippingPage;
