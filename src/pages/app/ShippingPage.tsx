import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Link } from "react-router-dom";
import { Download, QrCode, ScanLine } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { canChangeOutboundStatus, useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace } from "@/types/domain";

const ShippingPage = () => {
  const { data, isLoading, error, setOutboundStatus, isUpdatingOutbound, updateOutboundDraft } = useOutboundShipments();
  const { data: entities } = useLegalEntities();
  const { data: catalog } = useProductCatalog();
  const { legalEntityId } = useAppFilters();
  const { role } = useUserRole();
  const [scanValue, setScanValue] = React.useState<Record<string, string>>({});
  const [scanError, setScanError] = React.useState<Record<string, boolean>>({});
  const [qrOpenFor, setQrOpenFor] = React.useState<string | null>(null);
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [editableRows, setEditableRows] = React.useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = React.useState<"name" | "barcode" | "planned">("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filtered = React.useMemo(() => {
    const base = filterOutboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((x) => x.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);
  const lineRows = React.useMemo(
    () =>
      filtered.flatMap((x) =>
        Array.from({ length: Math.max(1, x.plannedUnits) }).map((_, idx) => ({
          ...x,
          lineId: `${x.id}-${idx + 1}`,
          lineQty: 1,
        })),
      ),
    [filtered],
  );
  const productMap = React.useMemo(() => new Map((catalog ?? []).map((p) => [p.id, p])), [catalog]);
  const preparedRows = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;
    return [...lineRows]
      .filter((x) => {
        const name = (productMap.get(x.productId)?.name ?? "").toLowerCase();
        const barcode = (productMap.get(x.productId)?.barcode ?? "").toLowerCase();
        return !s || name.includes(s) || barcode.includes(s);
      })
      .sort((a, b) => {
        if (sortKey === "barcode") {
          return ((productMap.get(a.productId)?.barcode ?? "").localeCompare(productMap.get(b.productId)?.barcode ?? "", "ru")) * dir;
        }
        if (sortKey === "planned") return (a.plannedUnits - b.plannedUnits) * dir;
        return ((productMap.get(a.productId)?.name ?? "").localeCompare(productMap.get(b.productId)?.name ?? "", "ru")) * dir;
      });
  }, [lineRows, productMap, search, sortDir, sortKey]);
  const onSort = (key: "name" | "barcode" | "planned") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const qrRow = qrOpenFor ? filtered.find((x) => x.id === qrOpenFor) ?? null : null;

  const onCreateBox = async (id: string) => {
    const row = filtered.find((x) => x.id === id);
    if (!row) return;
    if (row.boxBarcode) return;
    await updateOutboundDraft({
      id,
      patch: { boxBarcode: `BOX-${Date.now().toString().slice(-8)}` },
    });
    toast.success("Короб создан. Можно наполнять.");
  };

  const onPackScan = async (id: string) => {
    const row = filtered.find((x) => x.id === id);
    if (!row) return;
    const product = productMap.get(row.productId);
    const scanned = (scanValue[id] ?? "").trim();
    if (!row.boxBarcode) return toast.error("Сначала создайте короб");
    if (!scanned) return toast.error("Введите или отсканируйте баркод товара");
    if (!product || scanned !== product.barcode) {
      setScanError((s) => ({ ...s, [id]: true }));
      return toast.error("Товар не из плана отгрузки");
    }
    if (row.packedUnits + 1 > row.plannedUnits) {
      setScanError((s) => ({ ...s, [id]: true }));
      return toast.error("Превышение плана наполнения");
    }
    setScanError((s) => ({ ...s, [id]: false }));
    await updateOutboundDraft({ id, patch: { packedUnits: row.packedUnits + 1 } });
    setScanValue((s) => ({ ...s, [id]: "" }));
  };

  const exportPackingExcel = () => {
    const rowsExport = filtered
      .filter((x) => x.boxBarcode)
      .map((x) => ({
        "Баркод товара": productMap.get(x.productId)?.barcode ?? "",
        "Кол-во товаров": x.packedUnits || 0,
        "ШК короба": x.boxBarcode,
        "Срок годности": x.expiryDate || "",
      }));
    if (!rowsExport.length) return toast.error("Нет данных для выгрузки");
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Упаковка");
    XLSX.writeFile(wb, "shk-excel-export.xlsx");
  };

  const advanceStatus = async (
    id: string,
    current: "готов к отгрузке (резерв)" | "к отгрузке" | "отгружено",
    plannedUnits: number,
  ) => {
    try {
      if (current === "готов к отгрузке (резерв)") await setOutboundStatus({ id, status: "к отгрузке" });
      if (current === "к отгрузке") await setOutboundStatus({ id, status: "отгружено", shippedUnits: plannedUnits });
      toast.success("Статус обновлен");
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Задания на выдачу со склада FF и контроль остатков.</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: название, баркод" className="w-[250px]" />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={exportPackingExcel}>
            <Download className="h-4 w-4" />
            Экспорт shk-excel
          </Button>
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Отгрузки</CardTitle>
          <CardDescription className="text-slate-500">Статусы: создано → к отгрузке → отгружено</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить отгрузки.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Юрлицо</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => onSort("name")}>Товар</TableHead>
                  <TableHead>Склад назначения</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => onSort("barcode")}>Баркод</TableHead>
                  <TableHead>Площадка</TableHead>
                  <TableHead>Метод</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => onSort("planned")}>Количество к отгрузке</TableHead>
                  <TableHead className="text-right">Упаковано</TableHead>
                  <TableHead>ШК короба</TableHead>
                  <TableHead>ШК пропуска</TableHead>
                  <TableHead>Номер поставки</TableHead>
                  <TableHead>Срок годности</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Создано</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preparedRows.map((row) => (
                  <TableRow key={row.lineId} className={scanError[row.id] ? "bg-red-50" : undefined}>
                    <TableCell>
                      <Link to={`/legal-entities/${row.legalEntityId}?tab=shipping`} className="hover:underline">
                        {entities?.find((e) => e.id === row.legalEntityId)?.shortName ?? row.legalEntityId}
                      </Link>
                    </TableCell>
                    <TableCell>{productMap.get(row.productId)?.name ?? row.productId}</TableCell>
                    <TableCell>{row.sourceWarehouse}</TableCell>
                    <TableCell className="font-mono text-xs">{productMap.get(row.productId)?.barcode ?? "—"}</TableCell>
                    <TableCell><MarketplaceBadge marketplace={row.marketplace} /></TableCell>
                    <TableCell className="uppercase text-xs">{row.shippingMethod}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.lineQty}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={row.packedUnits > row.plannedUnits ? "text-red-600 font-semibold" : ""}>{row.packedUnits}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={!editableRows[row.id]}
                        className="h-8 font-mono"
                        value={row.boxBarcode}
                        onChange={(e) => void updateOutboundDraft({ id: row.id, patch: { boxBarcode: e.target.value } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input disabled={!editableRows[row.id]} className="h-8" value={row.gateBarcode} onChange={(e) => void updateOutboundDraft({ id: row.id, patch: { gateBarcode: e.target.value } })} />
                    </TableCell>
                    <TableCell>
                      <Input disabled={!editableRows[row.id]} className="h-8" value={row.supplyNumber} onChange={(e) => void updateOutboundDraft({ id: row.id, patch: { supplyNumber: e.target.value } })} />
                    </TableCell>
                    <TableCell>
                      <Input disabled={!editableRows[row.id]} className="h-8" type="date" value={row.expiryDate} onChange={(e) => void updateOutboundDraft({ id: row.id, patch: { expiryDate: e.target.value } })} />
                    </TableCell>
                    <TableCell><Badge variant={row.status === "отгружено" ? "default" : "secondary"}>{row.status}</Badge></TableCell>
                    <TableCell>{format(parseISO(row.createdAt), "d MMM yyyy HH:mm", { locale: ru })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditableRows((s) => ({ ...s, [row.id]: !s[row.id] }))}>
                          {editableRows[row.id] ? "Готово" : "Редактировать"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onCreateBox(row.id)}>
                          Короб
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setQrOpenFor(row.id)} disabled={!row.boxBarcode}>
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 w-28 font-mono"
                            placeholder="Скан баркода"
                            value={scanValue[row.id] ?? ""}
                            onChange={(e) => setScanValue((s) => ({ ...s, [row.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" onClick={() => void onPackScan(row.id)}>
                            <ScanLine className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {row.status !== "отгружено" && canChangeOutboundStatus(role) ? (
                        <Button size="sm" variant="outline" onClick={() => void advanceStatus(row.id, row.status, row.plannedUnits)} disabled={isUpdatingOutbound}>
                          {row.status === "готов к отгрузке (резерв)" ? "К отгрузке" : "Отгружено"}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">{row.status === "отгружено" ? "Завершено" : "Без доступа"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(qrRow)} onOpenChange={(v) => !v && setQrOpenFor(null)}>
        <DialogContent className="sm:max-w-md">
          <style>{`@media print{ @page { size: 58mm 40mm; margin:0; } body *{ visibility:hidden !important;} #box-qr-label,#box-qr-label *{ visibility:visible !important;} #box-qr-label{ position:fixed; left:0; top:0; } }`}</style>
          <DialogHeader><DialogTitle>Печать QR этикетки 58x40</DialogTitle></DialogHeader>
          {qrRow ? (
            <div className="space-y-3">
              <div id="box-qr-label" className="mx-auto flex h-[40mm] w-[58mm] flex-col items-center justify-center gap-2 border p-2">
                <QRCodeSVG value={qrRow.boxBarcode} size={120} />
                <p className="text-xs font-medium">{qrRow.sourceWarehouse}</p>
              </div>
              <Button onClick={() => window.print()}>Печать</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShippingPage;
