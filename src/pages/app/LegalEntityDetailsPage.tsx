import * as React from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLegalEntities, useOperationHistory, useProductCatalog, useUpdateLegalEntitySettings } from "@/hooks/useWmsMock";
import type { ProductCatalogItem } from "@/types/domain";
import { toast } from "sonner";

const LegalEntityDetailsPage = () => {
  const { id = "" } = useParams();
  const { data: legal } = useLegalEntities();
  const { data: history } = useOperationHistory();
  const { data: catalog, addProduct, isAddingProduct } = useProductCatalog();
  const { mutateAsync: updateSettings, isPending: isSavingSettings } = useUpdateLegalEntitySettings();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    photoUrl: "",
    name: "",
    brand: "",
    supplierArticle: "",
    manufacturer: "",
    country: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightKg: "",
    unitsPerPallet: "100",
  });

  const entity = React.useMemo(() => legal?.find((x) => x.id === id), [legal, id]);
  const rows = React.useMemo(() => (catalog ?? []).filter((x) => x.legalEntityId === id), [catalog, id]);
  const ops = React.useMemo(() => (history ?? []).filter((x) => x.legalEntityId === id), [history, id]);

  const onAdd = async () => {
    if (!entity) return;
    const lengthCm = Number(form.lengthCm);
    const widthCm = Number(form.widthCm);
    const heightCm = Number(form.heightCm);
    const weightKg = Number(form.weightKg);
    const unitsPerPallet = Number(form.unitsPerPallet);
    if (!form.name.trim() || !form.brand.trim() || !Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) {
      toast.error("Заполните обязательные поля");
      return;
    }
    await addProduct({
      legalEntityId: entity.id,
      photoUrl: form.photoUrl.trim() || null,
      name: form.name.trim(),
      brand: form.brand.trim(),
      supplierArticle: form.supplierArticle.trim(),
      manufacturer: form.manufacturer.trim(),
      country: form.country.trim(),
      lengthCm,
      widthCm,
      heightCm,
      weightKg: Number.isFinite(weightKg) ? weightKg : 0,
      unitsPerPallet: Number.isFinite(unitsPerPallet) && unitsPerPallet > 0 ? unitsPerPallet : 100,
    });
    toast.success("Товар добавлен в каталог");
    setOpen(false);
    setForm({
      photoUrl: "",
      name: "",
      brand: "",
      supplierArticle: "",
      manufacturer: "",
      country: "",
      lengthCm: "",
      widthCm: "",
      heightCm: "",
      weightKg: "",
      unitsPerPallet: "100",
    });
  };

  if (!entity) return <p className="text-sm text-slate-600">Юрлицо не найдено.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{entity.shortName}</h2>
        <p className="mt-1 text-sm text-slate-600">Карточка клиента: каталог, операции и тарифная модель хранения.</p>
      </div>

      <Tabs defaultValue="catalog" className="w-full">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="catalog">Каталог товаров</TabsTrigger>
          <TabsTrigger value="history">История операций</TabsTrigger>
          <TabsTrigger value="tariffs">Тарифы</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                  Добавить товар
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Новый товар в справочник</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Фото (URL)</Label>
                    <Input value={form.photoUrl} onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Название</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Бренд</Label>
                    <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Артикул поставщика</Label>
                    <Input value={form.supplierArticle} onChange={(e) => setForm((f) => ({ ...f, supplierArticle: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Производитель</Label>
                    <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Страна</Label>
                    <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Длина, см</Label>
                    <Input type="number" value={form.lengthCm} onChange={(e) => setForm((f) => ({ ...f, lengthCm: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Ширина, см</Label>
                    <Input type="number" value={form.widthCm} onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Высота, см</Label>
                    <Input type="number" value={form.heightCm} onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Вес, кг</Label>
                    <Input type="number" step="0.01" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Отмена
                  </Button>
                  <Button onClick={() => void onAdd()} disabled={isAddingProduct}>
                    {isAddingProduct ? "Сохранение..." : "Сохранить"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => toast.message("Импорт Excel", { description: "Демо: импорт каталога в процессе." })}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Импорт Excel
            </Button>
          </div>

          <Card className="border-slate-200">
            <CardContent className="p-0 sm:p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Товар</TableHead>
                    <TableHead>Бренд</TableHead>
                    <TableHead>Артикул</TableHead>
                    <TableHead>Логистика</TableHead>
                    <TableHead>Баркод</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.brand}</TableCell>
                      <TableCell className="font-mono text-xs">{p.supplierArticle || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-600">{`${p.lengthCm}x${p.widthCm}x${p.heightCm} см · ${p.weightKg} кг`}</TableCell>
                      <TableCell className="font-mono text-xs">{p.barcode}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-slate-200">
            <CardContent className="p-0 sm:p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Сотрудник</TableHead>
                    <TableHead>Действие</TableHead>
                    <TableHead>Товар / документ</TableHead>
                    <TableHead className="text-right">Кол-во</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>{format(parseISO(ev.dateIso), "d MMM yyyy HH:mm", { locale: ru })}</TableCell>
                      <TableCell>{ev.actor}</TableCell>
                      <TableCell>{ev.action}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{ev.productLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{ev.quantity.toLocaleString("ru-RU")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tariffs" className="space-y-3">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Настройки хранения</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Модель хранения</Label>
                <Select
                  value={entity.storageModel}
                  onValueChange={(v) =>
                    void updateSettings({ id: entity.id, patch: { storageModel: v as "by_volume" | "by_pallets" } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="by_volume">По объему (м3)</SelectItem>
                    <SelectItem value="by_pallets">По паллетам</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Текущая модель</Label>
                <p className="text-sm text-slate-600">
                  {entity.storageModel === "by_volume"
                    ? `${entity.tariffs.storagePerM3DayRub} ₽/м3/сут`
                    : `${entity.tariffs.storagePerPalletDayRub} ₽/паллету/сут`}
                </p>
              </div>
              {isSavingSettings && <p className="text-xs text-slate-500">Сохранение...</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LegalEntityDetailsPage;
