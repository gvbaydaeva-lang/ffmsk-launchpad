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
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useShipmentBoxes } from "@/hooks/useWmsMock";
import { exportShipmentBoxesForMarketplace } from "@/lib/shipmentExport";
import type { Marketplace } from "@/types/domain";

const ShippingPage = () => {
  const { data, isLoading, error, generateBoxes, isGenerating } = useShipmentBoxes();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace>("wb");

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    if (!data) return [];
    if (legalEntityId === "all") return data;
    return data.filter((b) => b.legalEntityId === legalEntityId);
  }, [data, legalEntityId]);

  const targetEntityForNew = legalEntityId === "all" ? "le-2" : legalEntityId;

  const onGenerate = async () => {
    try {
      await generateBoxes({ marketplace: mp, legalEntityId: targetEntityForNew });
      toast.success("Короб добавлен в список");
    } catch {
      toast.error("Не удалось сгенерировать короб");
    }
  };

  const onExport = (m: Marketplace) => {
    if (!rows.length) {
      toast.message("Нет коробов для выгрузки");
      return;
    }
    exportShipmentBoxesForMarketplace(rows, m);
    toast.success("Файл скачан (CSV для Excel)");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузки</h2>
        <p className="mt-1 text-sm text-slate-600">
          Коробы по площадкам и экспорт таблицы с колонками под WB, Ozon или Яндекс (CSV, UTF-8).
        </p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-lg text-slate-900">Коробы</CardTitle>
            <CardDescription className="text-slate-500">Генерация и выгрузка под конкретный маркетплейс</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="mp-gen" className="text-xs text-slate-600">
                Маркетплейс для нового короба
              </Label>
              <Select value={mp} onValueChange={(v) => setMp(v as Marketplace)}>
                <SelectTrigger id="mp-gen" className="w-full border-slate-200 bg-white sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wb">Wildberries</SelectItem>
                  <SelectItem value="ozon">Ozon</SelectItem>
                  <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={onGenerate} disabled={isGenerating} className="gap-2 shrink-0 bg-slate-900 text-white hover:bg-slate-800">
              <PackagePlus className="h-4 w-4" />
              {isGenerating ? "Генерация…" : "Сгенерировать короб"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 border-slate-200 bg-white shrink-0 shadow-none">
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
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Штрихкороб</TableHead>
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-slate-600">Площадка</TableHead>
                  <TableHead className="text-right text-slate-600">Шт.</TableHead>
                  <TableHead className="text-right text-slate-600">Вес, кг</TableHead>
                  <TableHead className="text-slate-600">Создан</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id} className="border-slate-100">
                    <TableCell className="font-mono text-xs text-slate-900 sm:text-sm">{b.boxBarcode}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800 text-sm">{entityName(b.legalEntityId)}</TableCell>
                    <TableCell>
                      <MarketplaceBadge marketplace={b.marketplace} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900">{b.itemsCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900">{b.weightKg}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                      {format(parseISO(b.createdAt), "d MMM yyyy HH:mm", { locale: ru })}
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

export default ShippingPage;
