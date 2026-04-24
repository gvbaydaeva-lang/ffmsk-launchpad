import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { canChangeInboundStatus, useUserRole } from "@/contexts/UserRoleContext";
import { useInboundSupplies, useLegalEntities } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { InboundSupply, Marketplace } from "@/types/domain";

const ReceivingPage = () => {
  const { data, isLoading, error, setInboundStatus, isUpdatingInbound, updateInboundDraft } = useInboundSupplies();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const { role } = useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [actualDraft, setActualDraft] = React.useState<Record<string, string>>({});

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    const base = filterInboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((r) => r.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);
  const lineRows = React.useMemo(
    () =>
      rows.flatMap((r) =>
        r.items.map((it, idx) => ({
          lineId: `${r.id}-${it.productId ?? it.barcode}-${idx}`,
          inboundId: r.id,
          documentNo: r.documentNo,
          legalEntityId: r.legalEntityId,
          productId: it.productId,
          title: it.name,
          barcode: it.barcode,
          article: it.supplierArticle,
          color: it.color,
          size: it.size,
          declaredQty: it.plannedQuantity,
          actualQty: it.factualQuantity,
          status: r.status,
          marketplace: r.marketplace,
          warehouse: r.destinationWarehouse,
        })),
      ),
    [rows],
  );


  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-slate-600">Входящие поставки по маркетплейсам и юрлицам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Поставки</CardTitle>
          <CardDescription className="text-slate-500">Статусы: ожидается → на приёмке → принято</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить список.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-slate-600">Товар</TableHead>
                  <TableHead className="text-slate-600">Баркод</TableHead>
                  <TableHead className="text-right text-slate-600">Количество заявленное</TableHead>
                  <TableHead className="text-right text-slate-600">Количество фактическое</TableHead>
                  <TableHead className="text-slate-600">Статус</TableHead>
                  <TableHead className="text-slate-600">Документ</TableHead>
                  <TableHead className="text-right text-slate-600">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineRows.map((row) => {
                  const actualValue = actualDraft[row.lineId] ?? (row.actualQty != null ? String(row.actualQty) : "");
                  const draftItems = rows.find((x) => x.id === row.inboundId)?.items ?? [];
                  const diffClass =
                    Number(actualValue || 0) < row.declaredQty
                      ? "bg-amber-50"
                      : Number(actualValue || 0) > row.declaredQty
                        ? "bg-red-50"
                        : "bg-emerald-50";
                  return (
                  <TableRow key={row.lineId} className={`border-slate-100 ${diffClass}`}>
                    <TableCell className="max-w-[160px] truncate text-slate-700 text-sm">
                      <Link to={`/legal-entities/${row.legalEntityId}?tab=receiving`} className="hover:underline">
                        {entityName(row.legalEntityId)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-slate-800">
                      <Input
                        className="h-8"
                        value={row.title}
                        onChange={(e) =>
                          void updateInboundDraft({
                            id: row.inboundId,
                            items: draftItems.map((it, idx) =>
                              `${row.inboundId}-${it.productId ?? it.barcode}-${idx}` === row.lineId ? { ...it, name: e.target.value } : it,
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Input
                        className="h-8 font-mono"
                        value={row.barcode}
                        onChange={(e) =>
                          void updateInboundDraft({
                            id: row.inboundId,
                            items: draftItems.map((it, idx) =>
                              `${row.inboundId}-${it.productId ?? it.barcode}-${idx}` === row.lineId ? { ...it, barcode: e.target.value } : it,
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-24 text-right"
                        value={row.declaredQty}
                        onChange={(e) =>
                          void updateInboundDraft({
                            id: row.inboundId,
                            items: draftItems.map((it, idx) =>
                              `${row.inboundId}-${it.productId ?? it.barcode}-${idx}` === row.lineId
                                ? { ...it, plannedQuantity: Number(e.target.value) || 0 }
                                : it,
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {canChangeInboundStatus(role) ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24 text-right"
                          value={actualValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActualDraft((s) => ({ ...s, [row.lineId]: val }));
                            void updateInboundDraft({
                              id: row.inboundId,
                              items: draftItems.map((it, idx) =>
                                `${row.inboundId}-${it.productId ?? it.barcode}-${idx}` === row.lineId
                                  ? { ...it, factualQuantity: Number(val) || 0 }
                                  : it,
                              ),
                            });
                          }}
                        />
                      ) : (
                        row.actualQty ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "принято"
                            ? "default"
                            : row.status === "на приёмке"
                              ? "default"
                              : "secondary"
                        }
                        className={
                          row.status === "на приёмке"
                            ? "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-600"
                            : "border-slate-200"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.documentNo}</TableCell>
                    <TableCell className="text-right">
                      {row.status !== "принято" && canChangeInboundStatus(role) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void setInboundStatus({
                              id: row.inboundId,
                              status: row.status === "ожидается" ? "на приёмке" : "принято",
                              receivedUnits: Number(actualValue) || row.declaredQty,
                            })
                          }
                          disabled={isUpdatingInbound}
                        >
                          {row.status === "ожидается" ? "На приёмке" : "Принять"}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">{row.status === "принято" ? "Завершено" : "Без доступа"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceivingPage;
