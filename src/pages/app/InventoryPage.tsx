import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { makeInventoryBalanceKeyFromMovement } from "@/lib/inventoryBalanceKey";
import { reservedQtyByBalanceKey } from "@/lib/inventoryReservedFromOutbound";
import { movementLocationTotalsForWarehouseBalanceKey } from "@/services/mockInventoryMovements";
import type { InventoryBalanceRow, InventoryMovement, Location, Marketplace } from "@/types/domain";
import { WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID } from "@/services/warehouseInboundApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const sourceLabel: Record<InventoryMovement["source"], string> = {
  receiving: "Приёмка",
  packing: "Упаковщик",
  shipping: "Отгрузка",
  placement: "Размещение",
};

const movementTypeLabel: Record<InventoryMovement["type"], string> = {
  INBOUND: "Приёмка",
  OUTBOUND: "Отгрузка",
  TRANSFER: "Перемещение",
};

const movementTypeClass: Record<InventoryMovement["type"], string> = {
  INBOUND: "text-emerald-700",
  OUTBOUND: "text-red-600",
  TRANSFER: "text-sky-700",
};

type InventoryRowWithLocation = InventoryBalanceRow & {
  baseKey: string;
  locationId: string;
  locationName: string;
  /** ISO дата последнего движения по строке «товар + locationId», для сортировки и отображения */
  lastMovementIso: string | null;
};

/** «Зона приёмки» в UI: RECEIVING_AREA, пусто или __no_location__; иначе — ячейка хранения */
type StockLocationKind = "receiving_zone" | "storage";

/** Строка таблицы «остатки по ячейкам»: только визуализация getInventoryBalance + movementLocationTotalsForWarehouseBalanceKey */
type StockByLocationRow = {
  rowKey: string;
  /** Ключ строки баланса (как в getInventoryBalance) — для reservedQtyByBalanceKey */
  balanceKey: string;
  legalEntityId: string;
  legalEntityName: string;
  productName: string;
  article: string;
  barcode: string;
  locationKind: StockLocationKind;
  /** id ячейки хранения; для receiving_zone не показываем в UI */
  locationId: string;
  /** Имя ячейки из справочника (только storage) */
  locationStorageName: string;
  qty: number;
  /** Из движений: max createdAt по этой строке; для сортировки */
  lastMovementIso: string | null;
};

function mpDisplay(mp: string): string {
  const m = mp.trim().toLowerCase();
  if (m === "wb") return "WB";
  if (m === "ozon") return "Ozon";
  if (m === "yandex") return "Яндекс";
  return mp || "—";
}

function formatLastMovementCell(iso: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  try {
    const d = parseISO(s);
    if (!Number.isFinite(d.getTime())) return "—";
    return format(d, "dd.MM.yyyy HH:mm", { locale: ru });
  } catch {
    return "—";
  }
}

/**
 * Последнее движение по паре «ключ остатка + место» из уже загруженных движений (для сортировки UI, без новых полей в API).
 * Логика привязки к ячейке согласована с фильтром истории в таблице складских остатков.
 */
function lastMovementIsoForStockLocationRow(
  movements: InventoryMovement[],
  warehouseName: string,
  balanceKey: string,
  rawLocId: string,
): string | null {
  const wh = (warehouseName ?? "—").trim() || "—";
  const rowLoc = rawLocId === "__no_location__" ? "" : (rawLocId || "").trim();
  let best: string | null = null;
  const consider = (iso: string) => {
    const s = (iso ?? "").trim();
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return;
    const prev = best ? Date.parse(best) : NaN;
    if (!Number.isFinite(prev) || t > prev) best = s;
  };
  for (const m of movements) {
    const mWh = (m.warehouseName ?? "—").trim() || "—";
    if (mWh !== wh) continue;
    if (makeInventoryBalanceKeyFromMovement(m) !== balanceKey) continue;
    const mIso = m.createdAt ?? "";
    if (m.type === "TRANSFER") {
      const from = (m.fromLocationId || "").trim();
      const to = (m.locationId || "").trim();
      if (rowLoc === from || rowLoc === to) consider(mIso);
      continue;
    }
    const movementLoc = (m.locationId || "").trim();
    if (movementLoc === rowLoc) consider(mIso);
  }
  return best && Number.isFinite(Date.parse(best)) ? best : null;
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
  const [stockPartnerId, setStockPartnerId] = React.useState<"all" | string>("all");
  const [stockProductSearch, setStockProductSearch] = React.useState("");
  const [stockHideZero, setStockHideZero] = React.useState(false);
  const movementDataSafe = React.useMemo(() => (Array.isArray(movementData) ? movementData : []), [movementData]);
  const locationsSafe = React.useMemo(() => (Array.isArray(locationsData) ? locationsData : []), [locationsData]);
  const productsSafe = React.useMemo(() => (Array.isArray(catalogRows) ? catalogRows : []), [catalogRows]);
  const legalEntitiesSafe = React.useMemo(() => (Array.isArray(entities) ? entities : []), [entities]);

  const warehouses = React.useMemo(
    () =>
      Array.from(new Set((balanceRows ?? []).map((r) => r.warehouseName)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru")),
    [balanceRows],
  );

  const reservedByKey = React.useMemo(
    () => reservedQtyByBalanceKey(outboundRows, productsSafe),
    [outboundRows, productsSafe],
  );

  const locations = locationsSafe;

  const storageLocations = React.useMemo(
    () => locationsSafe.filter((l) => l?.type === "storage"),
    [locationsSafe],
  );

  const receivingLocationIds = React.useMemo(() => {
    const ids = new Set(locationsSafe.filter((l) => l?.type === "receiving").map((l) => l.id));
    // Fallback для старых/неполных данных справочника: дефолтная зона приёмки.
    ids.add("loc-receiving");
    ids.add(WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID);
    return ids;
  }, [locationsSafe]);

  const locationById = React.useMemo(() => new Map(locationsSafe.map((l) => [l.id, l])), [locationsSafe]);

  const stockByLocationRows = React.useMemo<StockByLocationRow[]>(() => {
    const movements = movementDataSafe;
    const balances = Array.isArray(balanceRows) ? balanceRows : [];
    const out: StockByLocationRow[] = [];
    for (const br of balances) {
      const wh = (br.warehouseName ?? "—").trim() || "—";
      const byLoc = movementLocationTotalsForWarehouseBalanceKey(movements, wh, br.key);
      for (const [rawLocId, qty] of byLoc) {
        const lid = rawLocId === "__no_location__" ? "" : (rawLocId || "").trim();
        const receivingZoneUi = !lid || lid === WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID;
        const locationKind: StockLocationKind = receivingZoneUi ? "receiving_zone" : "storage";
        const locationStorageName = locationKind === "storage" ? (locationById.get(lid)?.name ?? "—") : "";
        out.push({
          rowKey: `${br.key}::${rawLocId}`,
          balanceKey: br.key,
          legalEntityId: br.legalEntityId,
          legalEntityName: br.legalEntityName,
          productName: br.name,
          article: (br.article ?? br.sku ?? "").trim(),
          barcode: (br.barcode ?? "").trim(),
          locationKind,
          locationId: lid,
          locationStorageName,
          qty: Math.trunc(Number(qty) || 0),
          lastMovementIso: lastMovementIsoForStockLocationRow(movements, wh, br.key, rawLocId),
        });
      }
    }
    out.sort((a, b) => {
      const aTs = Date.parse(a.lastMovementIso || "");
      const bTs = Date.parse(b.lastMovementIso || "");
      const aOk = Number.isFinite(aTs);
      const bOk = Number.isFinite(bTs);
      if (aOk && bOk) return bTs - aTs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return (
        a.legalEntityName.localeCompare(b.legalEntityName, "ru") ||
        a.productName.localeCompare(b.productName, "ru") ||
        `${a.locationKind} ${a.locationId} ${a.locationStorageName}`.localeCompare(
          `${b.locationKind} ${b.locationId} ${b.locationStorageName}`,
          "ru",
        )
      );
    });
    return out;
  }, [balanceRows, movementDataSafe, locationById]);

  const stockByLocationFiltered = React.useMemo(() => {
    let rows = stockByLocationRows;
    if (stockPartnerId !== "all") rows = rows.filter((r) => r.legalEntityId === stockPartnerId);
    const q = stockProductSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        `${r.productName} ${r.article} ${r.barcode}`.toLowerCase().includes(q),
      );
    }
    if (stockHideZero) rows = rows.filter((r) => r.qty !== 0);
    return rows;
  }, [stockByLocationRows, stockPartnerId, stockProductSearch, stockHideZero]);

  /** Как в таблице «Складские остатки»: полный резерв по ключу показываем только у первой строки этого ключа в текущем фильтре */
  const stockReservePrimaryRowKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockByLocationFiltered) {
      if (!m.has(r.balanceKey)) m.set(r.balanceKey, r.rowKey);
    }
    return m;
  }, [stockByLocationFiltered]);

  const rowsWithLocation = React.useMemo<InventoryRowWithLocation[]>(() => {
    const rows = movementDataSafe;
    const byKey = new Map<
      string,
      {
        sum: number;
        sample: InventoryMovement;
        baseKey: string;
        locationId: string;
        lastMovementIso: string | null;
      }
    >();
    for (const m of rows) {
      const baseKey = makeInventoryBalanceKeyFromMovement(m);
      if (m.type === "TRANSFER") {
        const qtyTr = Math.trunc(Number(m.qty) || 0);
        if (qtyTr <= 0 || !Number.isFinite(qtyTr)) continue;
        const fromId = (m.fromLocationId || "").trim();
        const toId = (m.locationId || "").trim();
        const bump = (
          locationId: string,
          delta: number,
          sample: InventoryMovement,
          isoCandidate: string,
        ) => {
          const lid = locationId.trim();
          const key = `${baseKey}::${lid || "no-location"}`;
          const curBump = byKey.get(key);
          const mIso = (isoCandidate ?? "").trim();
          const mTs = Date.parse(mIso);
          const mIsoOk = Number.isFinite(mTs);
          if (!curBump) {
            byKey.set(key, {
              sum: delta,
              sample,
              baseKey,
              locationId: lid,
              lastMovementIso: mIsoOk ? mIso : null,
            });
          } else {
            curBump.sum += delta;
            const curTs = Date.parse(curBump.lastMovementIso || "");
            if (mIsoOk && (!Number.isFinite(curTs) || mTs > curTs)) {
              curBump.lastMovementIso = mIso;
            }
          }
        };
        bump(fromId, -qtyTr, m, m.createdAt);
        bump(toId, qtyTr, m, m.createdAt);
        continue;
      }
      const locationId = (m.locationId || "").trim();
      const key = `${baseKey}::${locationId || "no-location"}`;
      const cur = byKey.get(key);
      const mIso = (m.createdAt ?? "").trim();
      const mTs = Date.parse(mIso);
      const mIsoOk = Number.isFinite(mTs);
      if (!cur) {
        byKey.set(key, {
          sum: m.qty,
          sample: m,
          baseKey,
          locationId,
          lastMovementIso: mIsoOk ? mIso : null,
        });
      } else {
        cur.sum += m.qty;
        const curTs = Date.parse(cur.lastMovementIso || "");
        if (mIsoOk && (!Number.isFinite(curTs) || mTs > curTs)) {
          cur.lastMovementIso = mIso;
        }
      }
    }
    return Array.from(byKey.values())
      .map(({ sum, sample, baseKey, locationId, lastMovementIso }) => ({
        key: `${baseKey}::${locationId || "no-location"}`,
        baseKey,
        locationId,
        locationName: locationId ? (locationById.get(locationId)?.name ?? "Без места") : "Без места",
        legalEntityId: sample.legalEntityId,
        legalEntityName: sample.legalEntityName,
        warehouseName: sample.warehouseName ?? "—",
        name: sample.name,
        sku: sample.sku ?? sample.article ?? "",
        article: sample.article ?? sample.sku ?? "",
        barcode: sample.barcode,
        marketplace: sample.marketplace ?? "",
        color: sample.color ?? "—",
        size: sample.size ?? "—",
        balanceQty: sum,
        lastMovementIso:
          lastMovementIso && Number.isFinite(Date.parse(lastMovementIso)) ? lastMovementIso : null,
      }))
      .sort((a, b) => {
        const aTs = Date.parse(a.lastMovementIso || "");
        const bTs = Date.parse(b.lastMovementIso || "");
        const aOk = Number.isFinite(aTs);
        const bOk = Number.isFinite(bTs);
        if (aOk && bOk) return bTs - aTs;
        if (aOk) return -1;
        if (bOk) return 1;
        return 0;
      });
  }, [movementDataSafe, locationById]);

  const filtered = React.useMemo(() => {
    let rows = rowsWithLocation;
    if (entityId !== "all") rows = rows.filter((x) => x.legalEntityId === entityId);
    if (warehouse !== "all") rows = rows.filter((x) => x.warehouseName === warehouse);
    if (mp !== "all") rows = rows.filter((x) => (x.marketplace || "").toLowerCase() === mp);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((x) =>
        `${x.legalEntityName} ${x.name} ${x.article} ${x.sku} ${x.barcode} ${x.locationName}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (availableZeroFromUrl) {
      rows = rows.filter((x) => {
        const reserveQty = reservedByKey.get(x.baseKey) ?? 0;
        return x.balanceQty - reserveQty <= 0;
      });
    }
    // В таблице «Складские остатки» показываем только реальные storage-ячейки.
    rows = rows.filter((x) => {
      const locId = (x.locationId || "").trim();
      const locType = locId ? locationById.get(locId)?.type : undefined;
      return locType === "storage";
    });
    // Скрываем полностью нулевые строки (остаток=0, резерв=0, доступно=0).
    rows = rows.filter((x) => {
      const reserveQty = reservedByKey.get(x.baseKey) ?? 0;
      const available = x.balanceQty - reserveQty;
      return !(x.balanceQty === 0 && reserveQty === 0 && available === 0);
    });
    return rows;
  }, [rowsWithLocation, entityId, warehouse, mp, search, availableZeroFromUrl, reservedByKey, locationById]);

  const reserveShownByBaseKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of filtered) {
      if (!map.has(row.baseKey)) map.set(row.baseKey, row.key);
    }
    return map;
  }, [filtered]);

  const historyMoves = React.useMemo(
    () => {
      if (!historyKey || !movementData) return [];
      const row = filtered.find((x) => x.key === historyKey);
      if (!row) return [];
      return movementDataSafe
        .filter((m) => {
          const baseKey = makeInventoryBalanceKeyFromMovement(m);
          const rowLoc = (row.locationId || "").trim();
          if (m.type === "TRANSFER") {
            const from = (m.fromLocationId || "").trim();
            const to = (m.locationId || "").trim();
            return baseKey === row.baseKey && (rowLoc === from || rowLoc === to);
          }
          const movementLoc = (m.locationId || "").trim();
          return baseKey === row.baseKey && movementLoc === row.locationId;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [historyKey, movementData, movementDataSafe, filtered],
  );
  const historyRow = historyKey ? filtered.find((r) => r.key === historyKey) : null;

  const tableLoading = isLoading || outboundLoading || catalogLoading;

  const unplacedRows = React.useMemo(() => {
    return rowsWithLocation
      .filter((row) => {
        const locId = (row.locationId || "").trim();
        if (!locId || !receivingLocationIds.has(locId)) return false;
        return row.balanceQty > 0;
      })
      .map((row) => ({
        key: row.key,
        legalEntityId: row.legalEntityId,
        legalEntityName: row.legalEntityName,
        warehouseName: row.warehouseName,
        name: row.name,
        article: row.article || row.sku || "—",
        barcode: row.barcode,
        marketplace: row.marketplace ?? "",
        color: row.color ?? "—",
        size: row.size ?? "—",
        qty: row.balanceQty,
        receivingLocationId: row.locationId,
        lastMovementAt: row.lastMovementIso ?? null,
      }))
      .sort((a, b) => {
        const aTs = Date.parse(a.lastMovementAt || "");
        const bTs = Date.parse(b.lastMovementAt || "");
        const aHas = Number.isFinite(aTs);
        const bHas = Number.isFinite(bTs);
        if (aHas && bHas) return bTs - aTs;
        if (aHas) return -1;
        if (bHas) return 1;
        return 0;
      });
  }, [rowsWithLocation, receivingLocationIds]);

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
        description: `Размещение: ${placingRow.name} (${placingRow.barcode}) из ${placingRow.receivingLocationName} в ${target?.name ?? "Без места"}, ${qty} шт`,
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
          <CardTitle className="text-base">Остатки по местам</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Разрез по ячейкам: «Всего» из движений по месту; резерв — из активных отгрузок (как на складе ниже); доступно =
            всего − резерв (резерв показывается у одной строки ключа, как в таблице складских остатков).
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={stockPartnerId} onValueChange={(v) => setStockPartnerId(v as "all" | string)}>
              <SelectTrigger className="h-9 w-[200px] border-slate-200">
                <SelectValue placeholder="Партнёр" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все партнёры</SelectItem>
                {legalEntitiesSafe.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={stockProductSearch}
                onChange={(e) => setStockProductSearch(e.target.value)}
                placeholder="Поиск по товару, артикулу, штрихкоду"
                className="h-9 border-slate-200 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="stock-hide-zero"
                checked={stockHideZero}
                onCheckedChange={(v) => setStockHideZero(v === true)}
              />
              <Label htmlFor="stock-hide-zero" className="cursor-pointer text-sm font-normal text-slate-700">
                Скрыть нулевые остатки
              </Label>
            </div>
          </div>
          {tableLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить движения.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-9 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Товар</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Артикул</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Штрихкод</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Партнёр</TableHead>
                    <TableHead className="px-3 py-2 text-xs font-semibold text-slate-600">Ячейка</TableHead>
                    <TableHead className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Всего</TableHead>
                    <TableHead className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Зарезервировано</TableHead>
                    <TableHead className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Доступно</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockByLocationFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-600">
                        Нет остатков
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockByLocationFiltered.map((r) => {
                      const artCell = r.article.trim() ? r.article : "—";
                      const bcCell = r.barcode.trim() ? r.barcode : "—";
                      const reserveQty =
                        stockReservePrimaryRowKey.get(r.balanceKey) === r.rowKey
                          ? (reservedByKey.get(r.balanceKey) ?? 0)
                          : 0;
                      const available = r.qty - reserveQty;
                      const rowMuted = available === 0;
                      const locationCell =
                        r.locationKind === "receiving_zone" ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Зона приёмки
                          </span>
                        ) : (
                          <>
                            <span className="font-mono text-[11px] text-slate-600">{r.locationId}</span>
                            <span className="mx-1 text-slate-400">/</span>
                            <span>{r.locationStorageName}</span>
                          </>
                        );
                      return (
                        <TableRow
                          key={r.rowKey}
                          className={cn("text-sm", rowMuted && "opacity-[0.68]")}
                        >
                          <TableCell className="max-w-[240px] px-3 py-2 font-medium text-slate-900">{r.productName}</TableCell>
                          <TableCell className="max-w-[140px] whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-slate-700">
                            {artCell}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-700">{bcCell}</TableCell>
                          <TableCell className="max-w-[160px] truncate px-3 py-2 text-slate-700">{r.legalEntityName}</TableCell>
                          <TableCell className="max-w-[280px] px-3 py-2 text-xs text-slate-700">{locationCell}</TableCell>
                          <TableCell className={cn("px-3 py-2 text-right tabular-nums", balanceClass(r.qty))}>
                            {r.qty.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className={cn("px-3 py-2 text-right tabular-nums", reserveClass(reserveQty))}>
                            {reserveQty.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className={cn("px-3 py-2 text-right tabular-nums", availableClass(available))}>
                            {available.toLocaleString("ru-RU")}
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
          {unplacedRows.length === 0 ? (
            <p className="text-sm text-slate-600">Неразмещённых товаров нет</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Название товара</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Баркод</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Место</TableHead>
                    <TableHead className="px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Количество</TableHead>
                    <TableHead className="w-[110px] px-2 py-1.5 text-right text-xs font-semibold text-slate-600">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unplacedRows.map((row) => {
                    const receivingName = locationById.get(row.receivingLocationId)?.name ?? "ПРИЕМКА";
                    return (
                      <TableRow key={row.key} className="h-8 text-xs">
                        <TableCell className="max-w-[220px] truncate px-2 py-1 font-medium">{row.name}</TableCell>
                        <TableCell className="max-w-[140px] truncate px-2 py-1 font-mono">{row.barcode || "—"}</TableCell>
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
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
                {legalEntitiesSafe.map((e) => (
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
                placeholder="Поиск: название, артикул, баркод, юрлицо, место"
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
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Место хранения</TableHead>
                    <TableHead className="px-2 py-1.5 text-xs font-semibold text-slate-600">Последнее движение</TableHead>
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
                      <TableCell colSpan={14} className="py-6 text-center text-xs text-slate-500">
                        Нет строк по фильтру. Завершите приёмку — товар появится здесь с положительным остатком.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row: InventoryRowWithLocation) => {
                      const reserveQty = reserveShownByBaseKey.get(row.baseKey) === row.key ? (reservedByKey.get(row.baseKey) ?? 0) : 0;
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
                        <TableCell className="px-2 py-1">{row.locationName}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 tabular-nums">
                          {formatLastMovementCell(row.lastMovementIso)}
                        </TableCell>
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
                          m.type === "TRANSFER" && historyRow
                            ? (m.fromLocationId || "").trim() === (historyRow.locationId || "").trim()
                              ? "text-red-600"
                              : "text-emerald-700"
                            : m.qty < 0
                              ? "text-red-600"
                              : "text-emerald-700"
                        }`}
                      >
                        {m.type === "TRANSFER" && historyRow ? (
                          <>
                            {(m.fromLocationId || "").trim() === (historyRow.locationId || "").trim() ? "−" : "+"}
                            {m.qty}
                          </>
                        ) : (
                          <>
                            {m.qty > 0 ? "+" : ""}
                            {m.qty}
                          </>
                        )}
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
                        {loc?.name ?? "Без места"}
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
