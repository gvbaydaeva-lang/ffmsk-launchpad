import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { InboundSupply, Marketplace } from "@/types/domain";

const ReceivingPage = () => {
  const { data, isLoading, error, createInbound, isCreating } = useInboundSupplies();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    legalEntityId: "le-2" as string,
    documentNo: "",
    supplier: "",
    marketplace: "wb" as Marketplace,
    expectedUnits: "",
    eta: "",
  });

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    const base = filterInboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((r) => r.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);

  const resetForm = () => {
    setForm({
      legalEntityId: "le-2",
      documentNo: "",
      supplier: "",
      marketplace: "wb",
      expectedUnits: "",
      eta: "",
    });
  };

  const onCreate = async () => {
    const units = Number(form.expectedUnits);
    if (!form.documentNo.trim() || !form.supplier.trim() || !form.eta || !Number.isFinite(units) || units <= 0) {
      toast.error("Заполните все поля корректно");
      return;
    }
    const draft: Omit<InboundSupply, "id"> = {
      legalEntityId: form.legalEntityId,
      documentNo: form.documentNo.trim(),
      supplier: form.supplier.trim(),
      marketplace: form.marketplace,
      expectedUnits: units,
      receivedUnits: null,
      status: "ожидается",
      eta: form.eta,
    };
    try {
      await createInbound(draft);
      toast.success("Приёмка создана");
      setOpen(false);
      resetForm();
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-slate-600">Входящие поставки по маркетплейсам и юрлицам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[200px]">
              <SelectValue placeholder="Площадка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                Создать приёмку
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новая приёмка</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label>Юрлицо</Label>
                  <Select value={form.legalEntityId} onValueChange={(v) => setForm((f) => ({ ...f, legalEntityId: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entities?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc">Номер документа</Label>
                  <Input
                    id="doc"
                    value={form.documentNo}
                    onChange={(e) => setForm((f) => ({ ...f, documentNo: e.target.value }))}
                    placeholder="ПТ-2026-0001"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sup">Поставщик</Label>
                  <Input
                    id="sup"
                    value={form.supplier}
                    onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="ООО «…»"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Маркетплейс</Label>
                  <Select
                    value={form.marketplace}
                    onValueChange={(v) => setForm((f) => ({ ...f, marketplace: v as Marketplace }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wb">Wildberries</SelectItem>
                      <SelectItem value="ozon">Ozon</SelectItem>
                      <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="exp">Ожидается единиц</Label>
                  <Input
                    id="exp"
                    type="number"
                    min={1}
                    value={form.expectedUnits}
                    onChange={(e) => setForm((f) => ({ ...f, expectedUnits: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eta">Ожидаемая дата</Label>
                  <Input id="eta" type="date" value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" onClick={onCreate} disabled={isCreating}>
                  {isCreating ? "Сохранение…" : "Создать"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Поставки</CardTitle>
          <CardDescription className="text-slate-500">Статусы: ожидается · частично · принято</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить список.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Документ</TableHead>
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-slate-600">Поставщик</TableHead>
                  <TableHead className="text-slate-600">Площадка</TableHead>
                  <TableHead className="text-right text-slate-600">Ожид.</TableHead>
                  <TableHead className="text-right text-slate-600">Принято</TableHead>
                  <TableHead className="text-slate-600">Статус</TableHead>
                  <TableHead className="text-slate-600">ETA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-slate-100">
                    <TableCell className="font-mono text-xs text-slate-900 sm:text-sm">{row.documentNo}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-slate-700 text-sm">{entityName(row.legalEntityId)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800">{row.supplier}</TableCell>
                    <TableCell>
                      <MarketplaceBadge marketplace={row.marketplace} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-900">{row.expectedUnits}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{row.receivedUnits ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "принято"
                            ? "default"
                            : row.status === "в обработке"
                              ? "default"
                              : "secondary"
                        }
                        className={
                          row.status === "в обработке"
                            ? "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-600"
                            : "border-slate-200"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                      {format(parseISO(row.eta), "d MMM yyyy", { locale: ru })}
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

export default ReceivingPage;
