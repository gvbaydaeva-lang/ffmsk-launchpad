import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Link } from "react-router-dom";
import { PackagePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { canChangeOutboundStatus, canCreateOutbound, useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace } from "@/types/domain";

const ShippingPage = () => {
  const { data, isLoading, error, createOutbound, setOutboundStatus, isCreatingOutbound, isUpdatingOutbound } = useOutboundShipments();
  const { data: entities } = useLegalEntities();
  const { data: catalog } = useProductCatalog();
  const { legalEntityId } = useAppFilters();
  const { role } = useUserRole();
  const [open, setOpen] = React.useState(false);
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [form, setForm] = React.useState({
    legalEntityId: "le-2",
    productId: "",
    plannedUnits: "",
    marketplace: "wb" as Marketplace,
    sourceWarehouse: "Склад Коледино",
    shippingMethod: "fbo" as "fbo" | "fbs" | "self",
  });

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

  const products = React.useMemo(
    () => (catalog ?? []).filter((x) => x.legalEntityId === form.legalEntityId && x.stockOnHand > 0),
    [catalog, form.legalEntityId],
  );
  const productMap = React.useMemo(() => new Map((catalog ?? []).map((p) => [p.id, p])), [catalog]);

  const onCreate = async () => {
    const qty = Number(form.plannedUnits);
    const product = productMap.get(form.productId);
    if (!product || !Number.isFinite(qty) || qty <= 0) return toast.error("Выберите товар и количество");
    if (qty > product.stockOnHand) return toast.error("Недостаточно остатка на складе");
    try {
      await createOutbound({
        legalEntityId: form.legalEntityId,
        productId: form.productId,
        marketplace: form.marketplace,
        sourceWarehouse: form.sourceWarehouse,
        shippingMethod: form.shippingMethod,
        plannedUnits: qty,
        shippedUnits: null,
        status: "создано",
      });
      toast.success("Задание на отгрузку создано");
      setOpen(false);
    } catch {
      toast.error("Не удалось создать отгрузку");
    }
  };

  const advanceStatus = async (id: string, current: "создано" | "к отгрузке" | "отгружено", plannedUnits: number) => {
    try {
      if (current === "создано") await setOutboundStatus({ id, status: "к отгрузке" });
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
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            {canCreateOutbound(role) && (
              <DialogTrigger asChild>
                <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                  <PackagePlus className="h-4 w-4" />
                  Новая отгрузка
                </Button>
              </DialogTrigger>
            )}
            <DialogContent>
              <DialogHeader><DialogTitle>Новое задание на отгрузку</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Юрлицо</Label>
                  <Select value={form.legalEntityId} onValueChange={(v) => setForm((f) => ({ ...f, legalEntityId: v, productId: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {entities?.map((e) => <SelectItem key={e.id} value={e.id}>{e.shortName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Товар из остатков</Label>
                  <Select value={form.productId} onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.brand} · {p.name} · остаток {p.stockOnHand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Количество к выдаче</Label>
                  <Input type="number" min={1} value={form.plannedUnits} onChange={(e) => setForm((f) => ({ ...f, plannedUnits: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>С какого склада</Label>
                  <Input value={form.sourceWarehouse} onChange={(e) => setForm((f) => ({ ...f, sourceWarehouse: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Маркетплейс</Label>
                  <Select value={form.marketplace} onValueChange={(v) => setForm((f) => ({ ...f, marketplace: v as Marketplace }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wb">Wildberries</SelectItem>
                      <SelectItem value="ozon">Ozon</SelectItem>
                      <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Способ отгрузки</Label>
                  <Select value={form.shippingMethod} onValueChange={(v) => setForm((f) => ({ ...f, shippingMethod: v as "fbo" | "fbs" | "self" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fbo">FBO</SelectItem>
                      <SelectItem value="fbs">FBS</SelectItem>
                      <SelectItem value="self">Самовывоз</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                <Button onClick={() => void onCreate()} disabled={isCreatingOutbound}>{isCreatingOutbound ? "Сохранение..." : "Создать"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                  <TableHead>Товар</TableHead>
                  <TableHead>Склад назначения</TableHead>
                  <TableHead>Баркод</TableHead>
                  <TableHead>Площадка</TableHead>
                  <TableHead>Метод</TableHead>
                  <TableHead className="text-right">Количество к отгрузке</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Создано</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineRows.map((row) => (
                  <TableRow key={row.lineId}>
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
                    <TableCell><Badge variant={row.status === "отгружено" ? "default" : "secondary"}>{row.status}</Badge></TableCell>
                    <TableCell>{format(parseISO(row.createdAt), "d MMM yyyy HH:mm", { locale: ru })}</TableCell>
                    <TableCell className="text-right">
                      {row.status !== "отгружено" && canChangeOutboundStatus(role) ? (
                        <Button size="sm" variant="outline" onClick={() => void advanceStatus(row.id, row.status, row.plannedUnits)} disabled={isUpdatingOutbound}>
                          {row.status === "создано" ? "К отгрузке" : "Отгружено"}
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
    </div>
  );
};

export default ShippingPage;
