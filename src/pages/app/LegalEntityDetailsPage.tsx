import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import Barcode from "react-barcode";
import { Download, FileSpreadsheet, Plus, Printer, Upload } from "lucide-react";
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
  "Цвет",
  "Размер",
  "Страна производства",
  "Состав",
  "Длина (см)",
  "Ширина (см)",
  "Высота (см)",
  "Вес (кг)",
] as const;

type RowDraft = {
  name: string;
  color: string;
  size: string;
  countryOfOrigin: string;
  composition: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
};

function text(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function hasValue(v: unknown) {
  return text(v) !== "";
}

function rowToDraft(item: ProductCatalogItem): RowDraft {
  return {
    name: item.name,
    color: item.color,
    size: item.size,
    countryOfOrigin: item.countryOfOrigin,
    composition: item.composition,
    lengthCm: String(item.lengthCm || ""),
    widthCm: String(item.widthCm || ""),
    heightCm: String(item.heightCm || ""),
    weightKg: String(item.weightKg || ""),
  };
}

function isDirty(item: ProductCatalogItem, draft: RowDraft | undefined) {
  if (!draft) return false;
  return (
    draft.name !== item.name ||
    draft.color !== item.color ||
    draft.size !== item.size ||
    draft.countryOfOrigin !== item.countryOfOrigin ||
    draft.composition !== item.composition ||
    draft.lengthCm !== String(item.lengthCm || "") ||
    draft.widthCm !== String(item.widthCm || "") ||
    draft.heightCm !== String(item.heightCm || "") ||
    draft.weightKg !== String(item.weightKg || "")
  );
}

function paramsLabel(item: ProductCatalogItem) {
  const dims =
    item.lengthCm > 0 && item.widthCm > 0 && item.heightCm > 0
      ? `${item.lengthCm}×${item.widthCm}×${item.heightCm} см`
      : "—";
  const weight = item.weightKg > 0 ? `${item.weightKg} кг` : "—";
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
  const [printOpen, setPrintOpen] = React.useState(false);
  const [excelRows, setExcelRows] = React.useState<Record<string, unknown>[]>([]);
  const [quickBarcode, setQuickBarcode] = React.useState("");
  const [printCopies, setPrintCopies] = React.useState("1");
  const [rowDrafts, setRowDrafts] = React.useState<Record<string, RowDraft>>({});
  const [form, setForm] = React.useState({
    category: "",
    photoUrl: "",
    name: "",
    brand: "",
    color: "",
    size: "",
    supplierArticle: "",
    manufacturer: "",
    countryOfOrigin: "",
    composition: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightKg: "",
    unitsPerPallet: "100",
  });

  const [printDraft, setPrintDraft] = React.useState({
    name: "",
    brand: "",
    legalEntity: "",
    color: "",
    size: "",
    countryOfOrigin: "",
    composition: "",
    supplierArticle: "",
    barcode: "",
  });
  const [printInclude, setPrintInclude] = React.useState<Record<string, boolean>>({
    name: true,
    brand: true,
    legalEntity: true,
    color: true,
    size: true,
    countryOfOrigin: true,
    composition: true,
    supplierArticle: true,
    barcode: true,
  });

  const entity = React.useMemo(() => legal?.find((x) => x.id === id), [legal, id]);
  const rows = React.useMemo(() => (catalog ?? []).filter((x) => x.legalEntityId === id), [catalog, id]);
  const ops = React.useMemo(() => (history ?? []).filter((x) => x.legalEntityId === id), [history, id]);
  const copies = Math.max(1, Number(printCopies) || 1);

  React.useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const item of rows) next[item.id] = rowToDraft(item);
    setRowDrafts(next);
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

  const openPrintDialog = (item: ProductCatalogItem) => {
    setPrintDraft({
      name: item.name,
      brand: item.brand,
      legalEntity: entity?.shortName ?? "",
      color: item.color,
      size: item.size,
      countryOfOrigin: item.countryOfOrigin,
      composition: item.composition,
      supplierArticle: item.supplierArticle,
      barcode: item.barcode,
    });
    setPrintCopies("1");
    setPrintOpen(true);
  };

  const onQuickBarcodeOpen = () => {
    const code = quickBarcode.trim();
    if (!code) return toast.error("Введите баркод");
    const hit = rows.find((r) => r.barcode === code);
    if (!hit) return toast.error("Товар с таким баркодом не найден");
    openPrintDialog(hit);
  };

  const onImport = async () => {
    if (!entity) return;
    let created = 0;
    let updated = 0;

    const byBarcode = new Map<string, Record<string, unknown>>();
    const noBarcode: Record<string, unknown>[] = [];
    for (const row of excelRows) {
      const barcode = text(row["Баркод"]);
      if (!barcode) noBarcode.push(row);
      else byBarcode.set(barcode, row);
    }

    const dedupedRows = [...noBarcode, ...Array.from(byBarcode.values())];
    const existingByBarcode = new Map(rows.map((r) => [r.barcode, r]));

    for (let i = 0; i < dedupedRows.length; i += 1) {
      const row = dedupedRows[i];
      const barcode = text(row["Баркод"]);
      const existing = barcode ? existingByBarcode.get(barcode) : undefined;

      const patch = {
        category: text(row["Категория товара"]),
        name: text(row["Название товара"]),
        brand: text(row["Бренд"]),
        color: text(row["Цвет"]),
        size: text(row["Размер"]),
        countryOfOrigin: text(row["Страна производства"]),
        composition: text(row["Состав"]),
        lengthCm: num(row["Длина (см)"]),
        widthCm: num(row["Ширина (см)"]),
        heightCm: num(row["Высота (см)"]),
        weightKg: num(row["Вес (кг)"]),
      };

      if (existing) {
        await updateProduct({
          id: existing.id,
          patch: {
            category: patch.category || existing.category,
            name: patch.name || existing.name,
            brand: patch.brand || existing.brand,
            color: patch.color || existing.color,
            size: patch.size || existing.size,
            countryOfOrigin: patch.countryOfOrigin || existing.countryOfOrigin,
            composition: patch.composition || existing.composition,
            lengthCm: hasValue(row["Длина (см)"]) ? patch.lengthCm : existing.lengthCm,
            widthCm: hasValue(row["Ширина (см)"]) ? patch.widthCm : existing.widthCm,
            heightCm: hasValue(row["Высота (см)"]) ? patch.heightCm : existing.heightCm,
            weightKg: hasValue(row["Вес (кг)"]) ? patch.weightKg : existing.weightKg,
          },
        });
        updated += 1;
      } else {
        const fallbackName = patch.name || patch.brand || `Товар ${barcode || i + 1}`;
        await addProduct({
          legalEntityId: entity.id,
          category: patch.category || "Без категории",
          photoUrl: null,
          name: fallbackName,
          brand: patch.brand || "Без бренда",
          color: patch.color,
          size: patch.size,
          supplierArticle: "",
          manufacturer: "",
          countryOfOrigin: patch.countryOfOrigin,
          composition: patch.composition,
          lengthCm: patch.lengthCm,
          widthCm: patch.widthCm,
          heightCm: patch.heightCm,
          weightKg: patch.weightKg,
          unitsPerPallet: 100,
          barcode: barcode || undefined,
        });
        created += 1;
      }
    }

    toast.success(`Импорт завершён: создано ${created}, обновлено ${updated}.`);
    setImportOpen(false);
    setExcelRows([]);
  };

  const onAdd = async () => {
    if (!entity || !form.name.trim()) return toast.error("Укажите название товара");
    await addProduct({
      legalEntityId: entity.id,
      category: form.category.trim() || "Без категории",
      photoUrl: form.photoUrl.trim() || null,
      name: form.name.trim(),
      brand: form.brand.trim() || "Без бренда",
      color: form.color.trim(),
      size: form.size.trim(),
      supplierArticle: form.supplierArticle.trim(),
      manufacturer: form.manufacturer.trim(),
      countryOfOrigin: form.countryOfOrigin.trim(),
      composition: form.composition.trim(),
      lengthCm: num(form.lengthCm),
      widthCm: num(form.widthCm),
      heightCm: num(form.heightCm),
      weightKg: num(form.weightKg),
      unitsPerPallet: Number(form.unitsPerPallet) || 100,
    });
    toast.success("Товар добавлен в каталог");
    setOpen(false);
    setForm({
      category: "",
      photoUrl: "",
      name: "",
      brand: "",
      color: "",
      size: "",
      supplierArticle: "",
      manufacturer: "",
      countryOfOrigin: "",
      composition: "",
      lengthCm: "",
      widthCm: "",
      heightCm: "",
      weightKg: "",
      unitsPerPallet: "100",
    });
  };

  const onRowAction = async (item: ProductCatalogItem) => {
    const draft = rowDrafts[item.id];
    if (!draft) return;
    if (!isDirty(item, draft)) return;
    await updateProduct({
      id: item.id,
      patch: {
        name: draft.name.trim() || item.name,
        color: draft.color.trim(),
        size: draft.size.trim(),
        countryOfOrigin: draft.countryOfOrigin.trim(),
        composition: draft.composition.trim(),
        lengthCm: num(draft.lengthCm),
        widthCm: num(draft.widthCm),
        heightCm: num(draft.heightCm),
        weightKg: num(draft.weightKg),
      },
    });
    toast.success("Товар сохранен");
  };

  const onUploadPhoto = async (idProduct: string, file: File) => {
    const url = URL.createObjectURL(file);
    await updateProduct({ id: idProduct, patch: { photoUrl: url } });
    toast.success("Фото загружено");
  };

  if (!entity) return <p className="text-sm text-slate-600">Юрлицо не найдено.</p>;

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: 58mm 40mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; width: 58mm; }
          body * { visibility: hidden !important; }
          #print-sheet, #print-sheet * { visibility: visible !important; }
          #print-sheet { position: fixed; left: 0; top: 0; width: 58mm; margin: 0 !important; padding: 0 !important; }
          .print-label {
            width: 58mm !important; height: 40mm !important; padding: 2mm !important; box-sizing: border-box;
            page-break-after: always; break-after: page; border: none !important;
          }
          .barcode-wrap svg { display: block !important; margin: 0 auto !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          <Link to="/legal-entities" className="hover:underline">
            {entity.shortName}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-slate-600">Нажмите на название, чтобы вернуться к списку юрлиц.</p>
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
                  <DialogTitle>Новый товар</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="grid gap-1.5"><Label>Категория</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Фото (URL)</Label><Input value={form.photoUrl} onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Название</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Бренд</Label><Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Цвет</Label><Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Размер</Label><Input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Страна производства</Label><Input value={form.countryOfOrigin} onChange={(e) => setForm((f) => ({ ...f, countryOfOrigin: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Состав</Label><Input value={form.composition} onChange={(e) => setForm((f) => ({ ...f, composition: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Артикул</Label><Input value={form.supplierArticle} onChange={(e) => setForm((f) => ({ ...f, supplierArticle: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Производитель</Label><Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Длина, см</Label><Input type="number" value={form.lengthCm} onChange={(e) => setForm((f) => ({ ...f, lengthCm: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Ширина, см</Label><Input type="number" value={form.widthCm} onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))} /></div>
                  <div className="grid gap-1.5"><Label>Высота, см</Label><Input type="number" value={form.heightCm} onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} /></div>
                  <div className="grid gap-1.5">
                    <Label>Вес, кг</Label>
                    <Input type="number" step="0.01" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} />
                    <p className="text-[11px] text-slate-500">Вес в кг (напр. 0.35)</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                  <Button onClick={() => void onAdd()} disabled={isAddingProduct}>{isAddingProduct ? "Сохранение..." : "Сохранить"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}><FileSpreadsheet className="h-4 w-4" />Импорт Excel</Button>
            <Button variant="outline" className="gap-2" onClick={downloadTemplate}><Download className="h-4 w-4" />Скачать шаблон</Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Быстрый ввод баркода для печати"
              value={quickBarcode}
              onChange={(e) => setQuickBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onQuickBarcodeOpen()}
              className="max-w-md font-mono"
            />
            <Button type="button" variant="outline" className="gap-2" onClick={onQuickBarcodeOpen}>
              <Printer className="h-4 w-4" />
              Открыть печать
            </Button>
          </div>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Импорт из Excel</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Дедупликация по баркоду: если товар есть, он обновится.</p>
                <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && void onExcelFile(e.target.files[0])} />
                {excelRows.length > 0 && <p className="text-xs text-slate-600">Готово: {excelRows.length} строк</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Отмена</Button>
                <Button onClick={() => void onImport()} disabled={!excelRows.length || isAddingProduct}>{isAddingProduct ? "Импорт..." : "Импортировать"}</Button>
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
                    <TableHead>Баркод</TableHead>
                    <TableHead>Цвет</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Страна</TableHead>
                    <TableHead>Состав</TableHead>
                    <TableHead>Параметры</TableHead>
                    <TableHead>Фото</TableHead>
                    <TableHead className="text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const draft = rowDrafts[item.id];
                    const dirty = isDirty(item, draft);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.photoUrl ? <img src={item.photoUrl} alt={item.name} className="h-10 w-10 rounded-md border object-cover" /> : <div className="h-10 w-10 rounded-md border border-dashed bg-slate-50" />}</TableCell>
                        <TableCell className="max-w-[220px] space-y-1">
                          <button type="button" className="block truncate text-left font-medium hover:underline" onClick={() => openPrintDialog(item)}>{item.name}</button>
                          <Input className="h-7 text-xs" value={draft?.name ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), name: e.target.value } }))} />
                        </TableCell>
                        <TableCell className="font-mono text-xs"><button type="button" className="hover:underline" onClick={() => openPrintDialog(item)}>{item.barcode}</button></TableCell>
                        <TableCell><Input className="h-7 text-xs" value={draft?.color ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), color: e.target.value } }))} /></TableCell>
                        <TableCell><Input className="h-7 text-xs" value={draft?.size ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), size: e.target.value } }))} /></TableCell>
                        <TableCell><Input className="h-7 text-xs" value={draft?.countryOfOrigin ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), countryOfOrigin: e.target.value } }))} /></TableCell>
                        <TableCell><Input className="h-7 text-xs" value={draft?.composition ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), composition: e.target.value } }))} /></TableCell>
                        <TableCell className="min-w-[240px] space-y-1 text-xs">
                          <p className="text-slate-600">{paramsLabel(item)}</p>
                          <div className="grid grid-cols-4 gap-1">
                            <Input className="h-7 px-2 text-xs" placeholder="L" value={draft?.lengthCm ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), lengthCm: e.target.value } }))} />
                            <Input className="h-7 px-2 text-xs" placeholder="W" value={draft?.widthCm ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), widthCm: e.target.value } }))} />
                            <Input className="h-7 px-2 text-xs" placeholder="H" value={draft?.heightCm ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), heightCm: e.target.value } }))} />
                            <Input className="h-7 px-2 text-xs" placeholder="кг (0.35)" type="number" step="0.01" value={draft?.weightKg ?? ""} onChange={(e) => setRowDrafts((s) => ({ ...s, [item.id]: { ...(s[item.id] ?? rowToDraft(item)), weightKg: e.target.value } }))} />
                          </div>
                          <p className="text-[11px] text-slate-500">Вес в кг (напр. 0.35)</p>
                        </TableCell>
                        <TableCell>
                          <Label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs">
                            <Upload className="h-3.5 w-3.5" />
                            Загрузить
                            <Input className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void onUploadPhoto(item.id, e.target.files[0])} />
                          </Label>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className={dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}
                            disabled={!dirty || isUpdatingProduct}
                            onClick={() => void onRowAction(item)}
                          >
                            {dirty ? "Сохранить" : "Редактировать"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={printOpen} onOpenChange={setPrintOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
              <DialogHeader><DialogTitle>Печать этикетки</DialogTitle></DialogHeader>
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3 no-print">
                  <div className="grid gap-1.5">
                    <Label>Количество этикеток</Label>
                    <Input type="number" min={1} step={1} value={printCopies} onChange={(e) => setPrintCopies(e.target.value)} />
                  </div>
                  {([
                    ["name", "Название"],
                    ["brand", "Бренд"],
                    ["legalEntity", "Юрлицо"],
                    ["color", "Цвет"],
                    ["size", "Размер"],
                    ["countryOfOrigin", "Страна производства"],
                    ["composition", "Состав"],
                    ["supplierArticle", "Артикул"],
                    ["barcode", "Баркод"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label>{label}</Label>
                        <Label className="flex items-center gap-1 text-xs text-slate-600">
                          <Input type="checkbox" className="h-3.5 w-3.5" checked={Boolean(printInclude[key])} onChange={(e) => setPrintInclude((s) => ({ ...s, [key]: e.target.checked }))} />
                          Включить в печать
                        </Label>
                      </div>
                      <Input value={printDraft[key]} onChange={(e) => setPrintDraft((s) => ({ ...s, [key]: e.target.value }))} className={key === "barcode" ? "font-mono" : ""} />
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs text-slate-600 no-print">Превью этикетки 58×40 мм</p>
                  <div className="mx-auto flex justify-center">
                    <div id="print-sheet" className="space-y-1">
                      {Array.from({ length: copies }).map((_, idx) => (
                        <div key={`label-${idx}`} className="print-label bg-white text-black" style={{ width: "58mm", height: "40mm", padding: "2mm", border: "1px solid #d9d9d9" }}>
                          {printInclude.name && <p className="text-[11px] font-semibold leading-tight">{printDraft.name || "—"}</p>}
                          {printInclude.brand && <p className="text-[10px] leading-tight">{printDraft.brand || "—"}</p>}
                          {printInclude.legalEntity && <p className="text-[9px] leading-tight">{printDraft.legalEntity || "—"}</p>}
                          {(printInclude.color || printInclude.size) && <p className="text-[9px] leading-tight">{printInclude.color ? `Цвет: ${printDraft.color || "—"}` : ""}{printInclude.color && printInclude.size ? " · " : ""}{printInclude.size ? `Размер: ${printDraft.size || "—"}` : ""}</p>}
                          {printInclude.countryOfOrigin && <p className="text-[9px] leading-tight">Страна: {printDraft.countryOfOrigin || "—"}</p>}
                          {printInclude.composition && <p className="text-[9px] leading-tight">Состав: {printDraft.composition || "—"}</p>}
                          {printInclude.supplierArticle && <p className="text-[9px] leading-tight">Арт.: {printDraft.supplierArticle || "—"}</p>}
                          {printInclude.barcode && printDraft.barcode && (
                            <div className="barcode-wrap mt-1 flex justify-center">
                              <Barcode value={printDraft.barcode} format="CODE128" height={30} width={1.35} fontSize={9} margin={0} background="#ffffff" displayValue />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => setPrintOpen(false)}>Закрыть</Button>
                <Button type="button" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" />Печать</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-slate-200">
            <CardContent className="p-0 sm:p-4">
              <Table>
                <TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Сотрудник</TableHead><TableHead>Действие</TableHead><TableHead>Товар / документ</TableHead><TableHead className="text-right">Кол-во</TableHead></TableRow></TableHeader>
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
            <CardHeader><CardTitle className="text-base">Настройки хранения</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Модель хранения</Label>
                <Select value={entity.storageModel} onValueChange={(v) => void updateSettings({ id: entity.id, patch: { storageModel: v as "by_volume" | "by_pallets" } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="by_volume">По объему (м3)</SelectItem>
                    <SelectItem value="by_pallets">По паллетам</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Текущая модель</Label>
                <p className="text-sm text-slate-600">{entity.storageModel === "by_volume" ? `${entity.tariffs.storagePerM3DayRub} ₽/м3/сут` : `${entity.tariffs.storagePerPalletDayRub} ₽/паллету/сут`}</p>
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
