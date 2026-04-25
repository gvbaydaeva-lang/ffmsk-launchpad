import * as React from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import {
  compareWorkflowPriority,
  taskWorkflowActionButtonClass,
  taskWorkflowActionLabel,
  taskWorkflowCardClass,
  workflowFromOutboundGroup,
} from "@/lib/taskWorkflowUi";

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
    const filteredDocs = !q
      ? docs
      : docs.filter((d) => {
          const entity = entities?.find((e) => e.id === d.legalEntityId)?.shortName ?? d.legalEntityId;
          return `${entity} ${d.assignmentNo}`.toLowerCase().includes(q);
        });
    return filteredDocs.sort((a, b) => {
      const w = compareWorkflowPriority(a.workflowStatus, b.workflowStatus);
      if (w !== 0) return w;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [filtered, search, entities]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Задания на выдачу со склада FF и контроль остатков.</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: юрлицо, номер" className="w-[250px]" />
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
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Задания на отгрузку</CardTitle>
          <CardDescription className="text-slate-500">
            Карточки документов. Для работы со сканированием откройте раздел «Упаковщик».
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить отгрузки.</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-600">Нет заданий для отображения.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((doc) => {
                const entity = entities?.find((e) => e.id === doc.legalEntityId)?.shortName ?? doc.legalEntityId;
                const wf = doc.workflowStatus;
                const dateLabel = doc.createdAt ? format(parseISO(doc.createdAt), "dd.MM.yyyy", { locale: ru }) : "—";
                return (
                  <Card key={doc.id} className={taskWorkflowCardClass(wf)}>
                    <CardHeader className="space-y-2 pb-2">
                      <CardTitle className="text-base">№ {doc.assignmentNo}</CardTitle>
                      <CardDescription>{entity}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-slate-600">
                        <p>Дата: {dateLabel}</p>
                        <p>
                          {doc.sourceWarehouse} / {doc.marketplace.toUpperCase()}
                        </p>
                        <p>
                          План {doc.planned} · Факт {doc.fact}
                        </p>
                      </div>
                      {wf === "completed" ? (
                        <Button type="button" variant="ghost" className={taskWorkflowActionButtonClass("completed")} disabled>
                          {taskWorkflowActionLabel("completed")}
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" className={taskWorkflowActionButtonClass(wf)} asChild>
                          <Link to="/packing">{taskWorkflowActionLabel(wf)}</Link>
                        </Button>
                      )}
                      <Button variant="outline" className="h-9 w-full border-slate-200 text-slate-700 shadow-none" asChild>
                        <Link to={`/legal-entities/${doc.legalEntityId}?tab=shipping`}>Карточка юрлица</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ShippingPage;
