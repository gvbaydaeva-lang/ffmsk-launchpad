import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { ChevronDown, PackagePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useShipmentBoxes } from "@/hooks/useWmsMock";
import { exportShipmentBoxesForMarketplace } from "@/lib/shipmentExport";
import type { Marketplace } from "@/types/domain";

const ShippingPage = () => {
  const { data, isLoading, error, generateBoxes, isGenerating } = useShipmentBoxes();
  const [mp, setMp] = React.useState<Marketplace>("wb");

  const onGenerate = async () => {
    try {
      await generateBoxes(mp);
      toast.success("Короб добавлен в список");
    } catch {
      toast.error("Не удалось сгенерировать короб");
    }
  };

  const onExport = (m: Marketplace) => {
    if (!data?.length) {
      toast.message("Нет коробов для выгрузки");
      return;
    }
    exportShipmentBoxesForMarketplace(data, m);
    toast.success("Файл скачан (CSV для Excel)");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Отгрузка</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Коробы по площадкам и экспорт таблицы с колонками под WB, Ozon или Яндекс (CSV, UTF-8).
        </p>
      </div>

      <Card className="border-border/80 shadow-elegant">
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-lg">Коробы</CardTitle>
            <CardDescription>Генерация и выгрузка под конкретный маркетплейс</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="mp-gen" className="text-xs">
                Маркетплейс для нового короба
              </Label>
              <Select value={mp} onValueChange={(v) => setMp(v as Marketplace)}>
                <SelectTrigger id="mp-gen" className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wb">Wildberries</SelectItem>
                  <SelectItem value="ozon">Ozon</SelectItem>
                  <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={onGenerate} disabled={isGenerating} className="gap-2 shrink-0">
              <PackagePlus className="h-4 w-4" />
              {isGenerating ? "Генерация…" : "Сгенерировать короб"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 shrink-0">
                  Экспорт в Excel (CSV)
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Формат колонок</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onExport("wb")}>Wildberries</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("ozon")}>Ozon</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("yandex")}>Яндекс.Маркет</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить коробы.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Штрихкороб</TableHead>
                    <TableHead>Площадка</TableHead>
                    <TableHead className="text-right">Шт.</TableHead>
                    <TableHead className="text-right">Вес, кг</TableHead>
                    <TableHead>Создан</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{b.boxBarcode}</TableCell>
                      <TableCell>
                        <MarketplaceBadge marketplace={b.marketplace} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.itemsCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.weightKg}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs sm:text-sm">
                        {format(parseISO(b.createdAt), "d MMM yyyy HH:mm", { locale: ru })}
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

export default ShippingPage;
