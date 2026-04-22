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
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useInboundSupplies } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { InboundSupply, Marketplace } from "@/types/domain";

const ReceivingPage = () => {
  const { data, isLoading, error, createInbound, isCreating } = useInboundSupplies();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    documentNo: "",
    supplier: "",
    marketplace: "wb" as Marketplace,
    expectedUnits: "",
    eta: "",
  });

  const rows = React.useMemo(() => filterInboundByMarketplace(data ?? [], mp), [data, mp]);

  const resetForm = () => {
    setForm({ documentNo: "", supplier: "", marketplace: "wb", expectedUnits: "", eta: "" });
  };

  const onCreate = async () => {
    const units = Number(form.expectedUnits);
    if (!form.documentNo.trim() || !form.supplier.trim() || !form.eta || !Number.isFinite(units) || units <= 0) {
      toast.error("Заполните все поля корректно");
      return;
    }
    const draft: Omit<InboundSupply, "id"> = {
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
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-muted-foreground">Входящие поставки по маркетплейсам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
              <Button className="gap-2">
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

      <Card className="border-border/80 shadow-elegant">
        <CardHeader>
          <CardTitle className="font-display text-lg">Поставки</CardTitle>
          <CardDescription>Статусы: ожидается · частично · принято</CardDescription>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Документ</TableHead>
                    <TableHead>Поставщик</TableHead>
                    <TableHead>Площадка</TableHead>
                    <TableHead className="text-right">Ожид.</TableHead>
                    <TableHead className="text-right">Принято</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{row.documentNo}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{row.supplier}</TableCell>
                      <TableCell>
                        <MarketplaceBadge marketplace={row.marketplace} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.expectedUnits}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.receivedUnits ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "принято"
                              ? "default"
                              : row.status === "в обработке"
                                ? "default"
                                : "secondary"
                          }
                          className={row.status === "в обработке" ? "bg-accent text-accent-foreground" : undefined}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs sm:text-sm">
                        {format(parseISO(row.eta), "d MMM yyyy", { locale: ru })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceivingPage;
