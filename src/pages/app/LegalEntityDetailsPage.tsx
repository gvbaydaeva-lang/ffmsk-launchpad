import * as React from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Download, FileSpreadsheet, Plus, Upload } from "lucide-react";
import * as XLSX from "xlsx";
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

const TEMPLATE_HEADERS = [
  "Категория товара",
  "Название товара",
  "Бренд",
  "Баркод",
  "Длина (см)",
  "Ширина (см)",
  "Высота (см)",
  "Вес (кг)",
] as const;

function num(v: unknown) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown) {
  return String(v ?? "").trim();
}

function logisticsLabel(p: ProductCatalogItem) {
  const hasDims = p.lengthCm > 0 && p.widthCm > 0 && p.heightCm > 0;
  const dims = hasDims ? `${p.lengthCm}×${p.widthCm}×${p.heightCm} см` : "—";
  const weight = p.weightKg > 0 ? `${p.weightKg} кг` : "—";
  return `${dims} — ${weight}`;
}

const LegalEntityDetailsPage = () => {
  const { id = "" } = useParams();
  const { data: legal } = useLegalEntities();
  const { data: history } = useOperationHistory();
  const { data: catalog, addProduct, updateProduct, isAddingProduct, isUpdatingProduct } = useProductCatalog();
  const { mutateAsync: updateSettings, isPending: isSavingSettings } = useUpdateLegalEntitySettings();
  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [excelRows, setExcelRows] = React.useState<Record<string, unknown>[]>([]);
  const [inlineDraft, setInlineDraft] = React.useState<Record<string, { lengthCm: string; widthCm: string; heightCm: string; weightKg: string }>>({});
  const [form, setForm] = React.useState({
    category: "",
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

  React.useEffect(() => {
    const next: Record<string, { lengthCm: string; widthCm: string; heightCm: string; weightKg: string }> = {};
    for (const r of rows) {
      next[r.id] = {
        lengthCm: String(r.lengthCm || ""),
        widthCm: String(r.widthCm || ""),
        heightCm: String(r.heightCm || ""),
        weightKg: String(r.weightKg || ""),
      };
    }
    setInlineDraft(next);
  }, [rows]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Каталог");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExcelFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!parsed.length) {
      toast.error("Файл пустой");
      return;
    }
    setExcelRows(parsed);
  };

  const onImport = async () => {
    if (!entity) return;
    let imported = 0;
    let missingDims = 0;
    for (let i = 0; i < excelRows.length; i += 1) {
      const row = excelRows[i];
      const category = text(row["Категория товара"]);
      const name = text(row["Название товара"]);
      const brand = text(row["Бренд"]);
      const barcode = text(row["Баркод"]);
      const lengthCm = num(row["Длина (см)"]);
      const widthCm = num(row["Ширина (см)"]);
      const heightCm = num(row["Высота (см)"]);
      const weightKg = num(row["Вес (кг)"]);

      const fallbackName = name || brand || `Товар ${barcode || i + 1}`;
      if (!(lengthCm > 0 && widthCm > 0 && heightCm > 0)) missingDims += 1;

      await addProduct({
        legalEntityId: entity.id,
        category: category || "Без категории",
        photoUrl: null,
        name: fallbackName,
        brand: brand || "Без бренда",
        supplierArticle: "",
        manufacturer: "",
        country: "",
        lengthCm,
        widthCm,
        heightCm,
        weightKg,
        unitsPerPallet: 100,
        barcode: barcode || undefined,
      });
      imported += 1;
    }
    if (missingDims > 0) {
      toast.warning(`Импорт завершён с предупреждением: у ${missingDims} товаров не указаны габариты.`);
    }
    toast.success(`Импортировано товаров: ${imported}`);
    setImportOpen(false);
    setExcelRows([]);
  };

  const onAdd = async () => {
    if (!entity) return;
    const lengthCm = Number(form.lengthCm);
    const widthCm = Number(form.widthCm);
    const heightCm = Number(form.heightCm);
    const weightKg = Number(form.weightKg);
    const unitsPerPallet = Number(form.unitsPerPallet);
    if (!form.name.trim()) {
      toast.error("Укажите название товара");
      return;
    }
    await addProduct({
      legalEntityId: entity.id,
      category: form.category.trim() || "Без категории",
      photoUrl: form.photoUrl.trim() || null,
      name: form.name.trim(),
      brand: form.brand.trim() || "Без бренда",
      supplierArticle: form.supplierArticle.trim(),
      manufacturer: form.manufacturer.trim(),
      country: form.country.trim(),
      lengthCm: Number.isFinite(lengthCm) ? lengthCm : 0,
      widthCm: Number.isFinite(widthCm) ? widthCm : 0,
      heightCm: Number.isFinite(heightCm) ? heightCm : 0,
      weightKg: Number.isFinite(weightKg) ? weightKg : 0,
      unitsPerPallet: Number.isFinite(unitsPerPallet) && unitsPerPallet > 0 ? unitsPerPallet : 100,
    });
    toast.success("Товар добавлен в каталог");
    setOpen(false);
    setForm({
      category: "",
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

  const saveInlineLogistics = async (idProduct: string) => {
    const d = inlineDraft[idProduct];
    if (!d) return;
    await updateProduct({
      id: idProduct,
      patch: {
        lengthCm: Number(d.lengthCm) || 0,
        widthCm: Number(d.widthCm) || 0,
        heightCm: Number(d.heightCm) || 0,
        weightKg: Number(d.weightKg) || 0,
      },
    });
    toast.success("Логистика обновлена");
  };

  const onUploadPhoto = async (idProduct: string, file: File) => {
    const url = URL.createObjectURL(file);
    await updateProduct({ id: idProduct, patch: { photoUrl: url } });
    toast.success("Фото привязано к товару");
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
                    <Label>Категория товара</Label>
                    <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                  </div>
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
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              Импорт Excel
            </Button>
            <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
              <Download className="h-4 w-4" />
              Скачать шаблон
            </Button>
          </div>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Импорт из Excel (по шаблону)</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Ожидаемые колонки: Категория товара, Название товара, Бренд, Баркод, Длина, Ширина, Высота, Вес.
                </p>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onExcelFile(f);
                  }}
                />
                {excelRows.length > 0 && <p className="text-xs text-slate-600">Готово к импорту: {excelRows.length} строк</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={() => void onImport()} disabled={!excelRows.length || isAddingProduct}>
                  {isAddingProduct ? "Импорт..." : "Импортировать"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border-slate-200">
            <CardContent className="p-0 sm:p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Фото</TableHead>
                    <TableHead>Товар</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Бренд</TableHead>
                    <TableHead>Логистика</TableHead>
                    <TableHead>Баркод</TableHead>
                    <TableHead>Фото</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.name} className="h-10 w-10 rounded-md border border-slate-200 object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-md border border-dashed border-slate-300 bg-slate-50" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{p.name}</TableCell>
                      <TableCell className="max-w-[140px] truncate">{p.category || "—"}</TableCell>
                      <TableCell>{p.brand}</TableCell>
                      <TableCell className="space-y-1 text-xs">
                        <p className="text-slate-600">{logisticsLabel(p)}</p>
                        <div className="grid grid-cols-4 gap-1">
                          <Input
                            value={inlineDraft[p.id]?.lengthCm ?? ""}
                            onChange={(e) =>
                              setInlineDraft((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? { lengthCm: "", widthCm: "", heightCm: "", weightKg: "" }), lengthCm: e.target.value } }))
                            }
                            placeholder="L"
                            className="h-7 px-2 text-xs"
                          />
                          <Input
                            value={inlineDraft[p.id]?.widthCm ?? ""}
                            onChange={(e) =>
                              setInlineDraft((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? { lengthCm: "", widthCm: "", heightCm: "", weightKg: "" }), widthCm: e.target.value } }))
                            }
                            placeholder="W"
                            className="h-7 px-2 text-xs"
                          />
                          <Input
                            value={inlineDraft[p.id]?.heightCm ?? ""}
                            onChange={(e) =>
                              setInlineDraft((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? { lengthCm: "", widthCm: "", heightCm: "", weightKg: "" }), heightCm: e.target.value } }))
                            }
                            placeholder="H"
                            className="h-7 px-2 text-xs"
                          />
                          <Input
                            value={inlineDraft[p.id]?.weightKg ?? ""}
                            onChange={(e) =>
                              setInlineDraft((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? { lengthCm: "", widthCm: "", heightCm: "", weightKg: "" }), weightKg: e.target.value } }))
                            }
                            placeholder="кг"
                            className="h-7 px-2 text-xs"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => void saveInlineLogistics(p.id)}
                          disabled={isUpdatingProduct}
                        >
                          Сохранить
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.barcode}</TableCell>
                      <TableCell>
                        <Label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs">
                          <Upload className="h-3.5 w-3.5" />
                          Загрузить
                          <Input
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void onUploadPhoto(p.id, f);
                            }}
                          />
                        </Label>
                      </TableCell>
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
