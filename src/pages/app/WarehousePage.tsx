import * as React from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useWarehouseInventory } from "@/hooks/useWmsMock";
import { groupInventoryRows } from "@/services/mockWarehouseInventory";
import type { Marketplace, WarehouseInventoryRow } from "@/types/domain";
import { toast } from "sonner";

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

function initials(brand: string, product: string) {
  const a = brand.trim().charAt(0).toUpperCase();
  const b = product.trim().charAt(0).toUpperCase();
  return `${a}${b}`;
}

const WarehousePage = () => {
  const { data, isLoading, error } = useWarehouseInventory();
  const { data: entities } = useLegalEntities();
  const { legalEntityId, setLegalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const filtered = React.useMemo(
    () => filterRows(data ?? [], search, mp, legalEntityId),
    [data, search, mp, legalEntityId],
  );
  const groups = React.useMemo(() => groupInventoryRows(filtered), [filtered]);

  React.useEffect(() => {
    setExpanded(new Set(groups.map((g) => groupKey(g))));
  }, [groups]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Складской учёт</h2>
        <p className="mt-1 text-sm text-slate-600">Остатки и адресное хранение по клиентам.</p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={legalEntityId} onValueChange={(v) => setLegalEntityId(v as "all" | string)}>
              <SelectTrigger className="h-9 w-[200px] border-slate-200">
                <SelectValue placeholder="Юрлицо" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все юрлица</SelectItem>
                {entities?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
              <SelectTrigger className="h-9 w-[180px] border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все МП</SelectItem>
                <SelectItem value="wb">WB</SelectItem>
                <SelectItem value="ozon">Ozon</SelectItem>
                <SelectItem value="yandex">Яндекс</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск: товар, баркод, ячейка"
                className="h-9 border-slate-200 pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <p className="py-4 text-sm text-destructive">Не удалось загрузить склад.</p>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-8 px-2" />
                  <TableHead className="w-[46%] px-2 text-slate-600">Товар</TableHead>
                  <TableHead className="w-[24%] px-2 text-slate-600">Характеристики / Ячейка</TableHead>
                  <TableHead className="w-[12%] px-2 text-right text-slate-600">Кол-во</TableHead>
                  <TableHead className="w-[14%] px-2 text-right text-slate-600">Хранение ₽/сут</TableHead>
                  <TableHead className="w-10 px-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const key = groupKey(g);
                  const open = expanded.has(key);
                  const totalQty = g.variants.reduce((s, v) => s + v.quantity, 0);
                  const totalStorage = g.variants.reduce((s, v) => s + v.storagePerDayRub, 0);
                  return (
                    <React.Fragment key={key}>
                      <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50">
                        <TableCell className="px-2">
                          <button type="button" className="inline-flex" onClick={() => toggleGroup(key)}>
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600">
                              {initials(g.brand, g.productName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {g.brand} · {g.productName}
                              </p>
                              <p className="truncate text-xs text-slate-500">{entities?.find((e) => e.id === g.legalEntityId)?.shortName ?? g.legalEntityId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 text-xs text-slate-500">Вариантов: {g.variants.length}</TableCell>
                        <TableCell className="px-2 text-right tabular-nums text-base font-bold text-slate-900">
                          {totalQty.toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className="px-2 text-right text-xs tabular-nums text-slate-500">
                          {totalStorage.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
                        </TableCell>
                        <TableCell className="px-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => toast.message("История", { description: `${g.productName} (группа)` })}>
                                История движений
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.message("Открыть карточку", { description: g.productName })}>
                                Карточка товара
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {open &&
                        g.variants.map((row) => (
                          <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/40">
                            <TableCell className="px-2" />
                            <TableCell className="px-2">
                              <p className="truncate text-xs text-slate-700">
                                {row.brand} · {row.productName}
                              </p>
                            </TableCell>
                            <TableCell className="px-2">
                              <div className="space-y-1">
                                <p className="truncate text-xs text-slate-600">
                                  {row.size} · {row.color} · <span className="font-mono">{row.barcode}</span>
                                </p>
                                <Badge variant="secondary" className="h-6 rounded border border-slate-300 bg-slate-100 px-2 font-mono text-[11px] text-slate-700">
                                  {row.cellCode}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="px-2 text-right tabular-nums text-sm font-bold text-slate-900">
                              {row.quantity.toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className="px-2 text-right text-[11px] tabular-nums text-slate-500">
                              {row.storagePerDayRub.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
                            </TableCell>
                            <TableCell className="px-2 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toast.message("История", { description: `${row.productName} · ${row.barcode}` })
                                    }
                                  >
                                    История движений
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toast.message("Печать этикетки", { description: `Ячейка ${row.cellCode}` })
                                    }
                                  >
                                    Печать этикетки
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
