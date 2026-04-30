import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAppendOperationLog,
  useInventoryMovements,
  useLegalEntities,
  useLocations,
  useOutboundShipments,
  useProductCatalog,
} from "@/hooks/useWmsMock";
import { getMovementsByBalanceKey } from "@/services/mockInventoryMovements";
import { reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import type { InventoryBalanceRow, InventoryMovement, Location, Marketplace } from "@/types/domain";
import { toast } from "sonner";

const sourceLabel: Record<InventoryMovement["source"], string> = {
  receiving: "Приёмка",
  packing: "Упаковщик",
  shipping: "Отгрузка",
};

const movementTypeLabel: Record<InventoryMovement["type"], string> = {
  INBOUND: "Приёмка",
  OUTBOUND: "Отгрузка",
};

const movementTypeClass: Record<InventoryMovement["type"], string> = {
  INBOUND: "text-emerald-700",
  OUTBOUND: "text-red-600",
};

function mpDisplay(mp: string): string {
  const m = mp.trim().toLowerCase();
  if (m === "wb") return "WB";
  if (m === "ozon") return "Ozon";
  if (m === "yandex") return "Яндекс";
  return mp || "—";
}

const InventoryPage = () => {
  const [searchParams] = useSearchParams();
  const availableZeroFromUrl = searchParams.get("available") === "zero";
  const { data: entities } = useLegalEntities();
  const { balanceRows, data: movementData, isLoading, error, addInventoryMovements, isAppending } = useInventoryMovements();
  const { data: outboundRows, isLoading: outboundLoading } = useOutboundShipments();
  const { data: catalogRows, isLoading: catalogLoading } = useProductCatalog();
  const { data: locationsData } = useLocations();
  const appendOperationLog = useAppendOperationLog();
  const [search, setSearch] = React.useState("");
  const [entityId, setEntityId] = React.useState<"all" | string>("all");
  const [warehouse, setWarehouse] = React.useState("all");
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [historyKey, setHistoryKey] = React.useState<string | null>(null);
  const [placingRow, setPlacingRow] = React.useState<{
    key: string;
    legalEntityId: string;
    legalEntityName: string;
    warehouseName: string;
    name: string;
    article: string;
    barcode: string;
    marketplace: string;
    color: string;
    size: string;
    availableQty: number;
    receivingLocationId: string;
    receivingLocationName: string;
  } | null>(null);
  const [placementQty, setPlacementQty] = React.useState<string>("");
  const [placementLocationId, setPlacementLocationId] = React.useState<string>("");

  const warehouses = React.useMemo(
    () =>
      Array.from(new Set(balanceRows.map((r) => r.warehouseName)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru")),
    [balanceRows],
  );

  const reservedByKey = React.useMemo(
    () => reservedQtyByBalanceKey(outboundRows, catalogRows),
    [outboundRows, catalogRows],
  );

  const filtered = React.useMemo(() => {
    let rows = balanceRows;
    if (entityId !== "all") rows = rows.filter((x) => x.legalEntityId === entityId);
    if (warehouse !== "all") rows = rows.filter((x) => x.warehouseName === warehouse);
    if (mp !== "all") rows = rows.filter((x) => (x.marketplace || "").toLowerCase() === mp);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((x) =>
        `${x.legalEntityName} ${x.name} ${x.article} ${x.sku} ${x.barcode}`.toLowerCase().includes(q),
      );
    }
    if (availableZeroFromUrl) {
      rows = rows.filter((x) => {
        const reserveQty = reservedByKey.get(x.key) ?? 0;
        return x.balanceQty - reserveQty <= 0;
      });
    }
    return rows;
  }, [balanceRows, entityId, warehouse, mp, search, availableZeroFromUrl, reservedByKey]);

  const historyMoves = React.useMemo(
    () => (historyKey && movementData ? getMovementsByBalanceKey(movementData, historyKey) : []),
    [historyKey, movementData],
  );
  const historyRow = historyKey ? balanceRows.find((r) => r.key === historyKey) : null;

  const tableLoading = isLoading || outboundLoading || catalogLoading;
  const locations = React.useMemo(() => (Array.isArray(locationsData) ? locationsData : []), [locationsData]);

  const storageLocations = React.useMemo(
    () => locations.filter((l) => l?.type === "storage"),
    [locations],
  );

  const receivingLocationIds = React.useMemo(
    () => new Set(locations.filter((l) => l?.type === "receiving").map((l) => l.id)),
    [locations],
  );

  const locationById = React.useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const unplacedRows = React.useMemo(() => {
    const rows = Array.isArray(movementData) ? movementData : [];
    const byKey = new Map<
      string,
      {
        key: string;
        legalEntityId: string;
        legalEntityName: string;
        warehouseName: string;
        name: string;
        article: string;
        barcode: string;
        marketplace: string;
        color: string;
        size: string;
        qty: number;
        receivingLocationId: string;
      }
    >();
    for (const m of rows) {
      const locId = (m.locationId || "").trim();
      if (!locId || !receivingLocationIds.has(locId)) continue;
      const rowKey = [
        m.legalEntityId,
        m.warehouseName ?? "—",
        m.barcode,
        m.article ?? m.sku ?? "",
        m.color ?? "",
        m.size ?? "",
        locId,
      ].join("::");
      const cur = byKey.get(rowKey);
      if (!cur) {
        byKey.set(rowKey, {
          key: rowKey,
          legalEntityId: m.legalEntityId,
          legalEntityName: m.legalEntityName,
          warehouseName: m.warehouseName ?? "—",
          name: m.name,
          article: m.article ?? m.sku ?? "—",
          barcode: m.barcode,
          marketplace: m.marketplace ?? "",
          color: m.color ?? "—",
          size: m.size ?? "—",
          qty: m.qty,
          receivingLocationId: locId,
        });
      } else {
        cur.qty += m.qty;
      }
    }
    let list = Array.from(byKey.values()).filter((x) => x.qty > 0);
    if (entityId !== "all") list = list.filter((x) => x.legalEntityId === entityId);
    if (warehouse !== "all") list = list.filter((x) => x.warehouseName === warehouse);
    if (mp !== "all") list = list.filter((x) => (x.marketplace || "").toLowerCase() === mp);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((x) =>
        `${x.legalEntityName} ${x.name} ${x.article} ${x.barcode}`.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.qty - a.qty);
  }, [movementData, receivingLocationIds, entityId, warehouse, mp, search]);

  const resetPlacementForm = () => {
    setPlacingRow(null);
    setPlacementQty("");
    setPlacementLocationId("");
  };

  const confirmPlacement = async () => {
    if (!placingRow) return;
    const qty = Math.trunc(Number(placementQty) || 0);
    if (qty <= 0) {
      toast.error("Укажите корректное количество");
      return;
    }
    if (qty > placingRow.availableQty) {
      toast.error("Нельзя разместить больше доступного количества");
      return;
    }
    const target = storageLocations.find((x) => x.id === placementLocationId) ?? null;
    if (!target) {
      toast.error("Выберите место хранения");
      return;
    }
    const ts = new Date().toISOString();
    const taskId = `placement-${Date.now()}`;
    const taskNumber = `PLACEMENT-${Date.now().toString().slice(-6)}`;
    const common: Omit<InventoryMovement, "id" | "type" | "qty" | "locationId"> = {
      taskId,
      taskNumber,
      legalEntityId: placingRow.legalEntityId,
      legalEntityName: placingRow.legalEntityName,
      warehouseName: placingRow.warehouseName,
      name: placingRow.name,
      sku: placingRow.article,
      article: placingRow.article,
      barcode: placingRow.barcode,
      marketplace: placingRow.marketplace,
      color: placingRow.color,
      size: placingRow.size,
      createdAt: ts,
      source: "receiving",
    };
    try {
      await addInventoryMovements([
        {
          ...common,
          id: `${taskId}-out`,
          type: "OUTBOUND",
          qty: -qty,
          locationId: placingRow.receivingLocationId,
        },
        {
          ...common,
          id: `${taskId}-in`,
          type: "INBOUND",
          qty,
          locationId: target.id,
        },
      ]);
      appendOperationLog({
        type: "PLACEMENT_COMPLETED",
        taskId,
        taskNumber,
        legalEntityId: placingRow.legalEntityId,
        legalEntityName: placingRow.legalEntityName,
        description: `Размещение: ${placingRow.name} (${placingRow.barcode}) из ${placingRow.receivingLocationName} в ${target.name}, ${qty} шт`,
      });
      toast.success("Товар размещён");
      resetPlacementForm();
    } catch {
      toast.error("Не удалось выполнить размещение");
    }
  };

  const balanceClass = (qty: number) => {
    if (qty < 0) return "text-right tabular-nums font-semibold text-red-600";
    if (qty === 0) return "text-right tabular-nums text-slate-400";
    return "text-right tabular-nums font-medium text-slate-900";
  };

  const reserveClass = (qty: number) => {
    if (qty <= 0) return "text-right tabular-nums text-slate-400";
    return "text-right tabular-nums font-medium text-slate-900";
  };

  const availableClass = (qty: number) => {
    if (qty < 0) return "text-right tabular-nums font-semibold text-red-600";
    if (qty === 0) return "text-right tabular-nums text-slate-400";
    return "text-right tabular-nums font-medium text-slate-900";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Остатки</h2>
        <p className="mt-1 text-sm text-slate-600">
          Остаток по движениям WMS; резерв — план в активных отгрузках (pending/processing); доступно = остаток − резерв.
        </p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <CardTitle className="text-base">Складские остатки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={entityId} onValueChange={(v) => setEntityId(v as "all" | string)}>
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
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger className="h-9 w-[200px] border-slate-200">
                <SelectValue placeholder="Склад" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
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
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск: название, артикул, баркод, юрлицо"
                className="h-9 border-slate-200 pl-9"
              />
            </div>
          </div>

          {tableLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить движения.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Склад</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Название</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Артикул</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Баркод</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">МП</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Цвет</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Размер</TableHead>
                    <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Остаток всего</TableHead>
                    <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Резерв</TableHead>
                    <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Доступно</TableHead>
                    <TableHead className="w-[88px] px-2 py-1.5 text-right text-xs font-semibold text-slate-600">
                      Действие
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="py-6 text-center text-xs text-slate-500">
                        Нет строк по фильтру. Завершите приёмку — товар появится здесь с положительным остатком.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row: InventoryBalanceRow) => {
                      const reserveQty = reservedByKey.get(row.key) ?? 0;
                      const available = row.balanceQty - reserveQty;
                      return (
                      <TableRow key={row.key} className="h-8 text-xs">
                        <TableCell className="max-w-[120px] truncate px-2 py-1">{row.legalEntityName}</TableCell>
                        <TableCell className="max-w-[100px] truncate px-2 py-1">{row.warehouseName}</TableCell>
                        <TableCell className="max-w-[180px] truncate px-2 py-1 font-medium">{row.name}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{row.article || "—"}</TableCell>
                        <TableCell className="max-w-[110px] truncate px-2 py-1 font-mono">{row.barcode || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{mpDisplay(row.marketplace)}</TableCell>
                        <TableCell className="px-2 py-1">{row.color}</TableCell>
                        <TableCell className="px-2 py-1">{row.size}</TableCell>
                        <TableCell className={`px-2 py-1 ${balanceClass(row.balanceQty)}`}>
                          {row.balanceQty.toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className={`px-2 py-1 ${reserveClass(reserveQty)}`}>
                          {reserveQty.toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className={`px-2 py-1 align-top ${availableClass(available)}`}>
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{available.toLocaleString("ru-RU")}</span>
                            {available < 0 ? (
                              <span className="text-[10px] font-semibold text-red-600">Недостаточно</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setHistoryKey(row.key)}
                          >
                            История
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <CardTitle className="text-base">Неразмещённые товары</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {tableLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Склад</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Товар</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Баркод</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Текущее место</TableHead>
                    <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Доступно</TableHead>
                    <TableHead className="w-[110px] px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unplacedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-xs text-slate-500">
                        Неразмещённых товаров в зоне ПРИЕМКА нет.
                      </TableCell>
                    </TableRow>
                  ) : (
                    unplacedRows.map((row) => {
                      const receivingName = locationById.get(row.receivingLocationId)?.name ?? "ПРИЕМКА";
                      return (
                        <TableRow key={row.key} className="h-8 text-xs">
                          <TableCell className="max-w-[120px] truncate px-2 py-1">{row.legalEntityName}</TableCell>
                          <TableCell className="max-w-[100px] truncate px-2 py-1">{row.warehouseName}</TableCell>
                          <TableCell className="max-w-[180px] truncate px-2 py-1 font-medium">{row.name}</TableCell>
                          <TableCell className="max-w-[110px] truncate px-2 py-1 font-mono">{row.barcode || "—"}</TableCell>
                          <TableCell className="px-2 py-1">{receivingName}</TableCell>
                          <TableCell className="px-2 py-1 text-right tabular-nums font-medium text-slate-900">
                            {row.qty.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                setPlacingRow({
                                  key: row.key,
                                  legalEntityId: row.legalEntityId,
                                  legalEntityName: row.legalEntityName,
                                  warehouseName: row.warehouseName,
                                  name: row.name,
                                  article: row.article,
                                  barcode: row.barcode,
                                  marketplace: row.marketplace,
                                  color: row.color,
                                  size: row.size,
                                  availableQty: row.qty,
                                  receivingLocationId: row.receivingLocationId,
                                  receivingLocationName: receivingName,
                                });
                                setPlacementQty(String(row.qty));
                                setPlacementLocationId("");
                              }}
                            >
                              Разместить
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
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
                <TableRow className="h-8 bg-slate-50/90 hover:bg-slate-50/90">
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Дата</TableHead>
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Тип</TableHead>
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">№ задания</TableHead>
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Юрлицо</TableHead>
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Склад</TableHead>
                  <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Количество</TableHead>
                  <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Источник</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyMoves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-xs text-slate-500">
                      Нет движений
                    </TableCell>
                  </TableRow>
                ) : (
                  historyMoves.map((m) => (
                    <TableRow key={m.id} className="h-8 text-xs">
                      <TableCell className="whitespace-nowrap px-2 py-1 tabular-nums">
                        {format(parseISO(m.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                      <TableCell className={`px-2 py-1 font-medium ${movementTypeClass[m.type]}`}>
                        {movementTypeLabel[m.type]}
                      </TableCell>
                      <TableCell className="px-2 py-1">{m.taskNumber}</TableCell>
                      <TableCell className="max-w-[120px] truncate px-2 py-1">{m.legalEntityName}</TableCell>
                      <TableCell className="max-w-[100px] truncate px-2 py-1">{m.warehouseName ?? "—"}</TableCell>
                      <TableCell
                        className={`px-2 py-1 text-right tabular-nums font-medium ${
                          m.qty < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </TableCell>
                      <TableCell className="px-2 py-1">{sourceLabel[m.source]}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!placingRow} onOpenChange={(open) => !open && resetPlacementForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Размещение товара</DialogTitle>
          </DialogHeader>
          {placingRow ? (
            <div className="grid gap-3 py-1">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium text-slate-900">{placingRow.name}</div>
                <div className="text-xs text-slate-600">
                  {placingRow.barcode} · {placingRow.article || "—"}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Текущее место: {placingRow.receivingLocationName} · Доступно: {placingRow.availableQty.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="placement-qty">Количество к размещению</Label>
                <Input
                  id="placement-qty"
                  type="number"
                  min={1}
                  max={placingRow.availableQty}
                  value={placementQty}
                  onChange={(e) => setPlacementQty(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Новое место хранения</Label>
                <Select value={placementLocationId} onValueChange={setPlacementLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите место" />
                  </SelectTrigger>
                  <SelectContent>
                    {storageLocations.map((loc: Location) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => resetPlacementForm()}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPlacement()}
              disabled={!placingRow || !placementLocationId || isAppending}
            >
              {isAppending ? "Размещение..." : "Подтвердить размещение"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryPage;
