import * as React from "react";
import { Link } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { getDefaultNewTariffs } from "@/services/mockWms";

const LegalEntitiesPage = () => {
  const { data, isLoading, error, addEntity, isAdding } = useLegalEntities();
  const { data: inbound } = useInboundSupplies();
  const { data: outbound } = useOutboundShipments();
  const { data: catalog } = useProductCatalog();
  const { legalEntityId } = useAppFilters();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    shortName: "",
    fullName: "",
    inn: "",
    kpp: "",
    ogrn: "",
    isActive: true,
  });

  const rows = React.useMemo(() => {
    if (!data) return [];
    if (legalEntityId === "all") return data;
    return data.filter((e) => e.id === legalEntityId);
  }, [data, legalEntityId]);

  const analyticsByEntity = React.useMemo(() => {
    const map = new Map<
      string,
      {
        inTransit: number;
        onStock: number;
        reserved: number;
      }
    >();
    for (const e of data ?? []) map.set(e.id, { inTransit: 0, onStock: 0, reserved: 0 });
    for (const x of inbound ?? []) {
      if (x.status !== "принято") {
        const acc = map.get(x.legalEntityId);
        if (acc) acc.inTransit += x.items.reduce((s, it) => s + it.plannedQuantity, 0);
      }
    }
    for (const p of catalog ?? []) {
      const acc = map.get(p.legalEntityId);
      if (acc) acc.onStock += p.stockOnHand;
    }
    for (const x of outbound ?? []) {
      if (x.status !== "отгружено") {
        const acc = map.get(x.legalEntityId);
        if (acc) acc.reserved += x.plannedUnits;
      }
    }
    return map;
  }, [data, inbound, outbound, catalog]);

  const onAdd = async () => {
    if (!form.shortName.trim() || !form.fullName.trim() || !form.inn.trim() || !form.ogrn.trim()) {
      toast.error("Заполните обязательные поля");
      return;
    }
    try {
      const def = getDefaultNewTariffs();
      await addEntity({
        shortName: form.shortName.trim(),
        fullName: form.fullName.trim(),
        inn: form.inn.trim(),
        kpp: form.kpp.trim(),
        ogrn: form.ogrn.trim(),
        isActive: form.isActive,
        tariffs: def,
        storageModel: "by_volume",
        warehouseSkuCount: 0,
        warehouseUnitsTotal: 0,
      });
      toast.success("Клиент добавлен");
      setOpen(false);
      setForm({ shortName: "", fullName: "", inn: "", kpp: "", ogrn: "", isActive: true });
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Юрлица</h2>
            <Badge variant="secondary" className="border border-slate-200 bg-slate-100 font-normal text-slate-600">
              Global
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">Клиенты фулфилмента и их тарифы</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start bg-slate-900 text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              Новый клиент
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Новая организация
              </DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-2 pr-1">
              <div className="grid gap-1.5">
                <Label htmlFor="sn">Краткое наименование</Label>
                <Input
                  id="sn"
                  value={form.shortName}
                  onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  placeholder="ООО «…»"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fn">Полное наименование</Label>
                <Input id="fn" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="inn">ИНН</Label>
                  <Input id="inn" value={form.inn} onChange={(e) => setForm((f) => ({ ...f, inn: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kpp">КПП</Label>
                  <Input id="kpp" value={form.kpp} onChange={(e) => setForm((f) => ({ ...f, kpp: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ogrn">ОГРН / ОГРНИП</Label>
                <Input id="ogrn" value={form.ogrn} onChange={(e) => setForm((f) => ({ ...f, ogrn: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <Label htmlFor="active">Активна</Label>
                <Switch id="active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={onAdd} disabled={isAdding}>
                {isAdding ? "Сохранение…" : "Добавить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Клиенты</CardTitle>
          <CardDescription className="text-slate-500">Список юридических лиц и остатки товаров</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Ошибка загрузки.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="font-mono text-slate-600">ИНН</TableHead>
                  <TableHead className="text-right text-slate-600">В пути</TableHead>
                  <TableHead className="text-right text-slate-600">На складе</TableHead>
                  <TableHead className="text-right text-slate-600">К отгрузке</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id} className="border-slate-100">
                    <TableCell className="max-w-[240px]">
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <Link to={`/legal-entities/${e.id}`} className="font-medium text-slate-900 hover:underline">
                          {e.shortName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">{e.inn}</TableCell>
                    <TableCell className="text-right tabular-nums">{analyticsByEntity.get(e.id)?.inTransit ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{analyticsByEntity.get(e.id)?.onStock ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-slate-900">
                      {analyticsByEntity.get(e.id)?.reserved ?? 0}
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

export default LegalEntitiesPage;
