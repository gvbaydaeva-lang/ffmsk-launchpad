import * as React from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInventoryMovements, useLegalEntities, useWarehouseInventory } from "@/hooks/useWmsMock";
import { getMovementsByBalanceKey } from "@/services/mockInventoryMovements";
import { groupInventoryRows } from "@/services/mockWarehouseInventory";
import type { InventoryBalanceRow, InventoryMovement, Marketplace, WarehouseInventoryRow } from "@/types/domain";
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

const sourceLabel: Record<InventoryMovement["source"], string> = {
  receiving: "Приёмка",
  packing: "Упаковщик",
  shipping: "Отгрузка",
};

const WarehousePage = () => {
  const { data, isLoading, error } = useWarehouseInventory();
  const { data: entities } = useLegalEntities();
  const { legalEntityId, setLegalEntityId } = useAppFilters();
  const { balanceRows, data: movementData, isLoading: movementsLoading, error: movementsError } = useInventoryMovements();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [balSearch, setBalSearch] = React.useState("");
  const [balEntity, setBalEntity] = React.useState<"all" | string>("all");
  const [balWh, setBalWh] = React.useState("all");
  const [balMp, setBalMp] = React.useState<Marketplace | "all">("all");
  const [historyKey, setHistoryKey] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const filtered = React.useMemo(
    () => filterRows(data ?? [], search, mp, legalEntityId),
    [data, search, mp, legalEntityId],
  );
  const balWarehouses = React.useMemo(
    () => Array.from(new Set(balanceRows.map((r) => r.warehouseName))).filter(Boolean).sort((a, b) => a.localeCompare(b, "ru")),
    [balanceRows],
  );

  const balanceFiltered = React.useMemo(() => {
    let b = balanceRows;
    if (balEntity !== "all") b = b.filter((x) => x.legalEntityId === balEntity);
    if (balWh !== "all") b = b.filter((x) => x.warehouseName === balWh);
    if (balMp !== "all") b = b.filter((x) => (x.marketplace || "").toLowerCase() === String(balMp).toLowerCase());
    const q = balSearch.trim().toLowerCase();
    if (q) {
      b = b.filter((x) =>
        `${x.legalEntityName} ${x.name} ${x.article} ${x.barcode} ${x.sku}`.toLowerCase().includes(q),
      );
    }
    return b;
  }, [balanceRows, balEntity, balWh, balMp, balSearch]);

  const historyMoves = React.useMemo(
    () => (historyKey && movementData ? getMovementsByBalanceKey(movementData, historyKey) : []),
    [historyKey, movementData],
  );
  const historyRow = historyKey ? balanceRows.find((r) => r.key === historyKey) : null;

  const groups = React.useMemo(() => groupInventoryRows(filtered), [filtered]);
  const occupancySummary = React.useMemo(() => {
    const map = new Map<string, { volume: number; pallets: number }>();
    for (const row of filtered) {
      const cur = map.get(row.legalEntityId) ?? { volume: 0, pallets: 0 };
      cur.volume += row.occupiedVolumeM3;
      cur.pallets += row.occupiedPallets;
      map.set(row.legalEntityId, cur);
    }
    return [...map.entries()].map(([id, v]) => ({
      legalEntityId: id,
      legalEntityName: entities?.find((e) => e.id === id)?.shortName ?? id,
      volume: v.volume,
      pallets: v.pallets,
    }));
  }, [filtered, entities]);

  React.useEffect(() => {
    setExpanded(new Set());
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
        <p className="mt-1 text-sm text-slate-600">Остатки по движениям WMS и адресное хранение по клиентам.</p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <CardTitle className="text-base">Остатки по движениям</CardTitle>
          <p className="text-sm text-slate-500">Остаток = сумма движений (приёмка +, отгрузка −).</p>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={balEntity} onValueChange={(v) => setBalEntity(v as "all" | string)}>
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
            <Select value={balWh} onValueChange={setBalWh}>
              <SelectTrigger className="h-9 w-[200px] border-slate-200">
                <SelectValue placeholder="Склад" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {balWarehouses.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={balMp} onValueChange={(v) => setBalMp(v as Marketplace | "all")}>
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
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={balSearch}
                onChange={(e) => setBalSearch(e.target.value)}
                placeholder="Поиск: название, артикул, баркод, юрлицо"
                className="h-9 border-slate-200 pl-9"
              />
            </div>
          </div>
          {movementsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : movementsError ? (
            <p className="text-sm text-destructive">Не удалось загрузить движения.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/90">
                    <TableHead className="text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Склад</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Название</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Артикул</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Баркод</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">МП</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Цвет</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Размер</TableHead>
                    <TableHead className="text-right text-xs font-semibold text-slate-600">Остаток</TableHead>
                    <TableHead className="w-[100px] text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-slate-500">
                        Нет остатков по фильтру (завершите приёмку для поступлений).
                      </TableCell>
                    </TableRow>
                  ) : (
                    balanceFiltered.map((row: InventoryBalanceRow) => (
                      <TableRow key={row.key} className="text-sm">
                        <TableCell className="max-w-[140px] truncate">{row.legalEntityName}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{row.warehouseName}</TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">{row.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.article || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.barcode || "—"}</TableCell>
                        <TableCell>{row.marketplace || "—"}</TableCell>
                        <TableCell>{row.color}</TableCell>
                        <TableCell>{row.size}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold ${
                            row.balanceQty < 0 ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {row.balanceQty.toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setHistoryKey(row.key)}>
                            История
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!historyKey} onOpenChange={(o) => !o && setHistoryKey(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              История движений
              {historyRow ? (
                <span className="ml-1 font-normal text-slate-500">
                  {historyRow.name} · {historyRow.barcode}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/90">
                  <TableHead className="text-xs">Дата</TableHead>
                  <TableHead className="text-xs">Тип</TableHead>
                  <TableHead className="text-xs">№ задания</TableHead>
                  <TableHead className="text-xs">Юрлицо</TableHead>
                  <TableHead className="text-xs">Склад</TableHead>
                  <TableHead className="text-right text-xs">Кол-во</TableHead>
                  <TableHead className="text-xs">Источник</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyMoves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-slate-500">
                      Нет движений
                    </TableCell>
                  </TableRow>
                ) : (
                  historyMoves.map((m) => (
                    <TableRow key={m.id} className="text-sm">
                      <TableCell className="whitespace-nowrap tabular-nums text-xs">
                        {format(parseISO(m.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.type}</TableCell>
                      <TableCell>{m.taskNumber}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{m.legalEntityName}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{m.warehouseName ?? "—"}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          m.qty < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </TableCell>
                      <TableCell className="text-xs">{sourceLabel[m.source]}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <p className="text-sm font-medium text-slate-700">Адресное хранение (карта ячеек)</p>
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

          {occupancySummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {occupancySummary.map((x) => (
                <Badge key={x.legalEntityId} variant="secondary" className="border-slate-200 bg-slate-50 text-slate-700">
                  {x.legalEntityName}: {x.volume.toFixed(2)} м3 · {x.pallets.toFixed(2)} паллет
                </Badge>
              ))}
            </div>
          )}

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
                  const parentBarcode = g.variants[0]?.barcode;
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
                              <p className="truncate text-xs text-slate-500">
                                {entities?.find((e) => e.id === g.legalEntityId)?.shortName ?? g.legalEntityId}
                                {parentBarcode ? (
                                  <>
                                    {" · "}
                                    <span className="font-mono text-[11px] text-slate-600">Баркод: {parentBarcode}</span>
                                  </>
                                ) : null}
                              </p>
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
                                  {row.size} · {row.color}
                                </p>
                                <p className="truncate text-xs font-mono text-slate-700">
                                  Баркод: <span className="font-semibold">{row.barcode}</span>
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
