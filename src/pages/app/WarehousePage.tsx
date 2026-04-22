import * as React from "react";
import { ChevronDown, ChevronRight, History, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useWarehouseInventory } from "@/hooks/useWmsMock";
import { groupInventoryRows } from "@/services/mockWarehouseInventory";
import type { Marketplace, WarehouseInventoryRow } from "@/types/domain";
import { toast } from "sonner";

const COL_SPAN = 12;

function groupKey(g: { productGroupId: string; legalEntityId: string }) {
  return `${g.productGroupId}:${g.legalEntityId}`;
}

function filterRows(rows: WarehouseInventoryRow[], q: string, mp: Marketplace | "all", legalEntityId: "all" | string) {
  let r = rows;
  if (legalEntityId !== "all") r = r.filter((x) => x.legalEntityId === legalEntityId);
  if (mp !== "all") r = r.filter((x) => x.marketplace === mp);
  const s = q.trim().toLowerCase();
  if (!s) return r;
  return r.filter(
    (row) =>
      row.brand.toLowerCase().includes(s) ||
      row.productName.toLowerCase().includes(s) ||
      row.color.toLowerCase().includes(s) ||
      row.barcode.toLowerCase().includes(s) ||
      row.cellCode.toLowerCase().includes(s) ||
      row.size.toLowerCase().includes(s),
  );
}

const WarehousePage = () => {
  const { data, isLoading, error } = useWarehouseInventory();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const filtered = React.useMemo(
    () => filterRows(data ?? [], search, mp, legalEntityId),
    [data, search, mp, legalEntityId],
  );

  const groups = React.useMemo(() => groupInventoryRows(filtered), [filtered]);

  React.useEffect(() => {
    setExpanded(new Set(groups.map((g) => groupKey(g))));
  }, [groups]);

  const expandAll = () => setExpanded(new Set(groups.map((g) => groupKey(g))));
  const collapseAll = () => setExpanded(new Set());
  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const flatCount = filtered.length;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Складской учёт</h2>
          <Badge variant="secondary" className="border border-slate-200 bg-slate-100 font-normal text-slate-600">
            Global
          </Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">Остатки по всем юрлицам · детальный учёт по вариантам (размер, цвет, баркод)</p>
      </div>

      <GlobalFiltersBar />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5 sm:w-[200px]">
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
        <div className="min-w-0 flex-1">
          <Label htmlFor="wh-search" className="text-slate-700">
            Поиск
          </Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="wh-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по SKU, названию, цвету…"
              className="border-slate-200 bg-white pl-9"
            />
          </div>
        </div>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-lg text-slate-900">Инвентарь</CardTitle>
            <CardDescription className="text-slate-500">Группировка по товару; строки — варианты с ячейкой и баркодом</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-600" onClick={expandAll}>
              Развернуть всё
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-600" onClick={collapseAll}>
              Свернуть
            </Button>
            <span className="text-slate-500">
              Групп: {groups.length} · Позиций: {flatCount}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить склад.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-10 text-slate-600" />
                  <TableHead className="min-w-[200px] text-slate-600">Товар (бренд · название · цвет)</TableHead>
                  <TableHead className="text-slate-600">Размер</TableHead>
                  <TableHead className="font-mono text-slate-600">Баркод</TableHead>
                  <TableHead className="text-slate-600">Ячейка</TableHead>
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-right text-slate-600">Кол-во</TableHead>
                  <TableHead className="text-right text-slate-600">Тариф ₽/сут</TableHead>
                  <TableHead className="text-right text-slate-600">Хранение ₽/сут</TableHead>
                  <TableHead className="text-slate-600">Статус</TableHead>
                  <TableHead className="text-slate-600">Действия</TableHead>
                  <TableHead className="text-slate-600">МП</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const key = groupKey(g);
                  const open = expanded.has(key);
                  const sumQty = g.variants.reduce((s, v) => s + v.quantity, 0);
                  const sumSt = g.variants.reduce((s, v) => s + v.storagePerDayRub, 0);
                  return (
                    <React.Fragment key={key}>
                      <TableRow className="border-slate-100 bg-slate-50/90 hover:bg-slate-50">
                        <TableCell colSpan={COL_SPAN} className="p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-left font-medium text-slate-900"
                              onClick={() => toggleGroup(key)}
                            >
                              {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                              {g.brand} · {g.productName}
                            </button>
                            <div className="flex flex-wrap gap-x-4 text-sm text-slate-600">
                              <span>{entityName(g.legalEntityId)}</span>
                              <span className="tabular-nums font-semibold text-slate-900">{sumQty} шт</span>
                              <span className="tabular-nums font-semibold text-emerald-600">
                                {sumSt.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽/сут
                              </span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {open &&
                        g.variants.map((row) => (
                          <TableRow key={row.id} className="border-slate-100">
                            <TableCell>
                              <Checkbox disabled aria-hidden className="opacity-40" />
                            </TableCell>
                            <TableCell className="pl-8 text-sm text-slate-600">
                              — {row.color} · {row.sizeNote}
                            </TableCell>
                            <TableCell className="text-slate-800">{row.size}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-700">{row.barcode}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-700">{row.cellCode}</TableCell>
                            <TableCell className="max-w-[160px] truncate text-sm text-slate-700">{entityName(row.legalEntityId)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-slate-900">{row.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums text-slate-700">
                              {row.tariffPerUnitDayRub.toLocaleString("ru-RU")} ₽
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums text-emerald-600">
                              {row.storagePerDayRub.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="border-slate-200 bg-white text-xs font-normal">
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 text-slate-600"
                                onClick={() =>
                                  toast.message("История движений", { description: `${row.productName} · ${row.barcode} (демо)` })
                                }
                              >
                                <History className="h-3.5 w-3.5" />
                                История
                              </Button>
                            </TableCell>
                            <TableCell>
                              <MarketplaceBadge marketplace={row.marketplace} />
                            </TableCell>
                          </TableRow>
                        ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehousePage;
