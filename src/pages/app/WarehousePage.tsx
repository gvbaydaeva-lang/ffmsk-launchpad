import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useStockFifo } from "@/hooks/useWmsMock";
import type { Marketplace } from "@/types/domain";

const WarehousePage = () => {
  const { data, isLoading, error } = useStockFifo();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");

  const rows = React.useMemo(() => {
    if (!data) return [];
    if (mp === "all") return data;
    return data.filter((r) => r.marketplace === mp);
  }, [data, mp]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Складской учёт</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Партии и FIFO; фильтр по маркетплейсу не меняет глобальный порядок партий.
          </p>
        </div>
        <div className="grid gap-1.5 sm:w-[220px]">
          <Label htmlFor="wh-mp">Маркетплейс</Label>
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger id="wh-mp">
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

      <Card className="border-border/80 shadow-elegant">
        <CardHeader>
          <CardTitle className="font-display text-lg">Остатки и партии (FIFO)</CardTitle>
          <CardDescription>Демо-данные до подключения WMS API</CardDescription>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">FIFO</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="min-w-[140px]">Товар</TableHead>
                    <TableHead>Партия</TableHead>
                    <TableHead>Поступление</TableHead>
                    <TableHead className="text-right">Кол-во</TableHead>
                    <TableHead>Площадка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant="secondary">{row.fifoRank}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs sm:text-sm">{row.sku}</TableCell>
                      <TableCell className="max-w-[200px] truncate sm:max-w-none">{row.productName}</TableCell>
                      <TableCell className="font-mono text-xs sm:text-sm">{row.batchCode}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs sm:text-sm">
                        {format(parseISO(row.receivedAt), "d MMM yyyy", { locale: ru })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                      <TableCell>
                        <MarketplaceBadge marketplace={row.marketplace} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehousePage;
