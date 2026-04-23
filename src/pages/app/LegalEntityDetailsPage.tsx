import * as React from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { FileSpreadsheet, Plus } from "lucide-react";
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
import { toast } from "sonner";

const IMPORT_FIELDS = [
  { key: "name", label: "Название (Name)", required: true },
  { key: "brand", label: "Бренд", required: false },
  { key: "supplierArticle", label: "Артикул поставщика", required: false },
  { key: "manufacturer", label: "Производитель", required: false },
  { key: "country", label: "Страна", required: false },
  { key: "lengthCm", label: "Длина, см", required: false },
  { key: "widthCm", label: "Ширина, см", required: false },
  { key: "heightCm", label: "Высота, см", required: false },
  { key: "weightKg", label: "Вес, кг", required: false },
  { key: "unitsPerPallet", label: "Ед. на паллету", required: false },
  { key: "photoUrl", label: "Фото (URL)", required: false },
  { key: "barcode", label: "Баркод", required: false },
] as const;

type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
type ColumnMapping = Record<ImportFieldKey, string>;

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function guessMapping(headers: string[]): ColumnMapping {
  const dict = headers.reduce<Record<string, string>>((acc, h) => {
    acc[norm(h)] = h;
    return acc;
  }, {});
  const pick = (...variants: string[]) => {
    for (const v of variants) {
      const found = dict[norm(v)];
      if (found) return found;
    }
    return "__none__";
  };
  return {
    name: pick("Название", "Name", "Товар"),
    brand: pick("Бренд", "Brand"),
    supplierArticle: pick("Артикул", "Артикул поставщика", "SupplierArticle"),
    manufacturer: pick("Производитель", "Manufacturer"),
    country: pick("Страна", "Country"),
    lengthCm: pick("Длина", "Длина, см", "Length"),
    widthCm: pick("Ширина", "Ширина, см", "Width"),
    heightCm: pick("Высота", "Высота, см", "Height"),
    weightKg: pick("Вес", "Вес, кг", "Weight"),
    unitsPerPallet: pick("Ед. на паллету", "UnitsPerPallet"),
    photoUrl: pick("Фото", "Photo", "PhotoUrl"),
    barcode: pick("Баркод", "Barcode"),
  };
}

const LegalEntityDetailsPage = () => {
  const { id = "" } = useParams();
  const { data: legal } = useLegalEntities();
  const { data: history } = useOperationHistory();
  const { data: catalog, addProduct, isAddingProduct } = useProductCatalog();
  const { mutateAsync: updateSettings, isPending: isSavingSettings } = useUpdateLegalEntitySettings();
  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [excelHeaders, setExcelHeaders] = React.useState<string[]>([]);
  const [excelRows, setExcelRows] = React.useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>({
    name: "__none__",
    brand: "__none__",
    supplierArticle: "__none__",
    manufacturer: "__none__",
    country: "__none__",
    lengthCm: "__none__",
    widthCm: "__none__",
    heightCm: "__none__",
    weightKg: "__none__",
    unitsPerPallet: "__none__",
    photoUrl: "__none__",
    barcode: "__none__",
  });
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

  const resetImport = () => {
    setExcelHeaders([]);
    setExcelRows([]);
    setMapping({
      name: "__none__",
      brand: "__none__",
      supplierArticle: "__none__",
      manufacturer: "__none__",
      country: "__none__",
      lengthCm: "__none__",
      widthCm: "__none__",
      heightCm: "__none__",
      weightKg: "__none__",
      unitsPerPallet: "__none__",
      photoUrl: "__none__",
      barcode: "__none__",
    });
  };

  const onExcelFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!rows.length) {
      toast.error("Файл пустой");
      return;
    }
    const headers = Object.keys(rows[0]);
    setExcelHeaders(headers);
    setExcelRows(rows);
    setMapping(guessMapping(headers));
  };

  const onImport = async () => {
    if (!entity) return;
    if (mapping.name === "__none__") {
      toast.error("Сопоставьте колонку Название (Name)");
      return;
    }
    let imported = 0;
    let missingDims = 0;
    for (const row of excelRows) {
      const val = (field: ImportFieldKey) => {
        const h = mapping[field];
        if (!h || h === "__none__") return "";
        const raw = row[h];
        return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
      };
      const name = val("name");
      if (!name) continue;
      const lengthCm = Number(val("lengthCm"));
      const widthCm = Number(val("widthCm"));
      const heightCm = Number(val("heightCm"));
      if (!(lengthCm > 0 && widthCm > 0 && heightCm > 0)) missingDims += 1;
      await addProduct({
        legalEntityId: entity.id,
        photoUrl: val("photoUrl") || null,
        name,
        brand: val("brand") || "Без бренда",
        supplierArticle: val("supplierArticle"),
        manufacturer: val("manufacturer"),
        country: val("country"),
        lengthCm: lengthCm > 0 ? lengthCm : 0,
        widthCm: widthCm > 0 ? widthCm : 0,
        heightCm: heightCm > 0 ? heightCm : 0,
        weightKg: Number(val("weightKg")) || 0,
        unitsPerPallet: Number(val("unitsPerPallet")) || 100,
        barcode: val("barcode") || undefined,
      });
      imported += 1;
    }
    if (missingDims > 0) {
      toast.warning(`Импорт завершён с предупреждением: у ${missingDims} товаров не указаны габариты.`);
    }
    toast.success(`Импортировано товаров: ${imported}`);
    setImportOpen(false);
    resetImport();
  };

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
              onClick={() => setImportOpen(true)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Импорт Excel
            </Button>
          </div>

          <Dialog
            open={importOpen}
            onOpenChange={(v) => {
              setImportOpen(v);
              if (!v) resetImport();
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Импорт Excel и сопоставление колонок</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-1.5">
                  <Label>Файл Excel (.xlsx, .xls)</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onExcelFile(f);
                    }}
                  />
                </div>
                {excelHeaders.length > 0 && (
                  <>
                    <div className="rounded-md border border-slate-200 p-2 text-xs text-slate-600">
                      Найдено колонок: {excelHeaders.length}. Строк в файле: {excelRows.length}.
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {IMPORT_FIELDS.map((f) => (
                        <div key={f.key} className="grid gap-1">
                          <Label>
                            {f.label}
                            {f.required ? " *" : ""}
                          </Label>
                          <Select
                            value={mapping[f.key]}
                            onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Не сопоставлено" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Не сопоставлять</SelectItem>
                              {excelHeaders.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={() => void onImport()} disabled={isAddingProduct || !excelRows.length}>
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
