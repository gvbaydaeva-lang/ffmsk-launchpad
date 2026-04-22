import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useStockFifo } from "@/hooks/useWmsMock";
import type { Marketplace } from "@/types/domain";

const WarehousePage = () => {
  const { data, isLoading, error } = useStockFifo();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    if (!data) return [];
    let r = data;
    if (legalEntityId !== "all") r = r.filter((x) => x.legalEntityId === legalEntityId);
    if (mp !== "all") r = r.filter((x) => x.marketplace === mp);
    return r;
  }, [data, mp, legalEntityId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Складской учёт</h2>
        <p className="mt-1 text-sm text-slate-600">Партии и FIFO; фильтр по маркетплейсу и юрлицу из верхней панели.</p>
      </div>

      <GlobalFiltersBar />

      <div className="flex flex-col justify-end gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5 sm:w-[220px]">
          <Label htmlFor="wh-mp" className="text-slate-700">
            Маркетплейс
          </Label>
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger id="wh-mp" className="border-slate-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Остатки и партии (FIFO)</CardTitle>
          <CardDescription className="text-slate-500">Демо-данные до подключения WMS API</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить таблицу.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-12 text-slate-600">FIFO</TableHead>
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-slate-600">SKU</TableHead>
                  <TableHead className="min-w-[140px] text-slate-600">Товар</TableHead>
                  <TableHead className="text-slate-600">Партия</TableHead>
                  <TableHead className="text-slate-600">Поступление</TableHead>
                  <TableHead className="text-right text-slate-600">Кол-во</TableHead>
                  <TableHead className="text-slate-600">Площадка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-slate-100">
                    <TableCell>
                      <Badge variant="secondary" className="border-slate-200 bg-slate-100">
                        {row.fifoRank}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800 text-sm">{entityName(row.legalEntityId)}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 sm:text-sm">{row.sku}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800 sm:max-w-none">{row.productName}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 sm:text-sm">{row.batchCode}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                      {format(parseISO(row.receivedAt), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900">{row.quantity}</TableCell>
                    <TableCell>
                      <MarketplaceBadge marketplace={row.marketplace} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehousePage;
