import * as React from "react";
import { useParams } from "react-router-dom";
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

function hasText(v: unknown) {
  return text(v) !== "";
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
  const [printOpen, setPrintOpen] = React.useState(false);
  const [excelRows, setExcelRows] = React.useState<Record<string, unknown>[]>([]);
  const [quickBarcode, setQuickBarcode] = React.useState("");
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
  const [printDraft, setPrintDraft] = React.useState({
    name: "",
    brand: "",
    legalEntity: "",
    color: "",
    size: "",
    country: "",
    supplierArticle: "",
    barcode: "",
  });
  const [printInclude, setPrintInclude] = React.useState<Record<string, boolean>>({
    name: true,
    brand: true,
    legalEntity: true,
    color: true,
    size: true,
    country: true,
    supplierArticle: true,
    barcode: true,
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

  const openPrintDialog = (product: ProductCatalogItem) => {
    setPrintDraft({
      name: product.name,
      brand: product.brand,
      legalEntity: entity?.shortName ?? "",
      color: "",
      size: "",
      country: product.country,
      supplierArticle: product.supplierArticle,
      barcode: product.barcode,
    });
    setPrintOpen(true);
  };

  const onQuickBarcodeOpen = () => {
    const code = quickBarcode.trim();
    if (!code) {
      toast.error("Введите баркод");
      return;
    }
    const hit = rows.find((r) => r.barcode === code);
    if (!hit) {
      toast.error("Товар с таким баркодом не найден");
      return;
    }
    openPrintDialog(hit);
  };

  const onImport = async () => {
    if (!entity) return;
    let created = 0;
    let updated = 0;
    let missingDims = 0;
    const byBarcode = new Map<string, Record<string, unknown>>();
    const noBarcode: Record<string, unknown>[] = [];
    for (const row of excelRows) {
      const barcode = text(row["Баркод"]);
      if (!barcode) {
        noBarcode.push(row);
        continue;
      }
      byBarcode.set(barcode, row);
    }
    const dedupedRows = [...noBarcode, ...Array.from(byBarcode.values())];
    const existingByBarcode = new Map(rows.map((r) => [r.barcode, r]));

    for (let i = 0; i < dedupedRows.length; i += 1) {
      const row = dedupedRows[i];
      const category = text(row["Категория товара"]);
      const name = text(row["Название товара"]);
      const brand = text(row["Бренд"]);
      const barcode = text(row["Баркод"]);
      const lengthRaw = row["Длина (см)"];
      const widthRaw = row["Ширина (см)"];
      const heightRaw = row["Высота (см)"];
      const weightRaw = row["Вес (кг)"];
      const lengthCm = num(lengthRaw);
      const widthCm = num(widthRaw);
      const heightCm = num(heightRaw);
      const weightKg = num(weightRaw);

      const fallbackName = name || brand || `Товар ${barcode || i + 1}`;
      if (!(lengthCm > 0 && widthCm > 0 && heightCm > 0)) missingDims += 1;

      const existing = barcode ? existingByBarcode.get(barcode) : undefined;
      if (existing) {
        await updateProduct({
          id: existing.id,
          patch: {
            category: category || existing.category,
            name: name || existing.name,
            brand: brand || existing.brand,
            lengthCm: hasText(lengthRaw) ? lengthCm : existing.lengthCm,
            widthCm: hasText(widthRaw) ? widthCm : existing.widthCm,
            heightCm: hasText(heightRaw) ? heightCm : existing.heightCm,
            weightKg: hasText(weightRaw) ? weightKg : existing.weightKg,
          },
        });
        updated += 1;
      } else {
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
        created += 1;
      }
    }
    if (missingDims > 0) {
      toast.warning(`Импорт завершён с предупреждением: у ${missingDims} товаров не указаны габариты.`);
    }
    toast.success(`Импорт завершён: создано ${created}, обновлено ${updated}.`);
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
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-label-area,
          #print-label-area * {
            visibility: visible !important;
          }
          #print-label-area {
            position: fixed;
            left: 0;
            top: 0;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
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
                    <Input
                      type="number"
                      step="0.01"
                      value={form.weightKg}
                      onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                    />
                    <p className="text-[11px] text-slate-500">Вес в кг (напр. 0.35)</p>
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
          <div className="flex w-full items-center gap-2">
            <Input
              placeholder="Быстрый ввод баркода для печати этикетки"
              value={quickBarcode}
              onChange={(e) => setQuickBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onQuickBarcodeOpen();
              }}
              className="max-w-md font-mono"
            />
            <Button type="button" variant="outline" className="gap-2" onClick={onQuickBarcodeOpen}>
              <Printer className="h-4 w-4" />
              Открыть печать
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
                      <TableCell className="max-w-[220px] truncate">
                        <button
                          type="button"
                          className="truncate text-left text-slate-900 underline-offset-2 hover:underline"
                          onClick={() => openPrintDialog(p)}
                        >
                          {p.name}
                        </button>
                      </TableCell>
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
                            placeholder="кг (0.35)"
                            step="0.01"
                            type="number"
                            className="h-7 px-2 text-xs"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">Вес в кг (напр. 0.35)</p>
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
                      <TableCell className="font-mono text-xs">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => openPrintDialog(p)}
                        >
                          {p.barcode}
                        </button>
                      </TableCell>
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

          <Dialog open={printOpen} onOpenChange={setPrintOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Печать этикетки</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3 no-print">
                  {(
                    [
                      ["name", "Название"],
                      ["brand", "Бренд"],
                      ["legalEntity", "Юрлицо"],
                      ["color", "Цвет"],
                      ["size", "Размер"],
                      ["country", "Страна производства"],
                      ["supplierArticle", "Артикул"],
                      ["barcode", "Баркод"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label>{label}</Label>
                        <Label className="flex items-center gap-1 text-xs text-slate-600">
                          <Input
                            className="h-3.5 w-3.5"
                            type="checkbox"
                            checked={Boolean(printInclude[key])}
                            onChange={(e) => setPrintInclude((s) => ({ ...s, [key]: e.target.checked }))}
                          />
                          Включить в печать
                        </Label>
                      </div>
                      <Input
                        value={printDraft[key]}
                        onChange={(e) => setPrintDraft((s) => ({ ...s, [key]: e.target.value }))}
                        className={key === "barcode" ? "font-mono" : ""}
                      />
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs text-slate-600 no-print">Превью этикетки 58×40 мм</p>
                  <div className="mx-auto flex items-start justify-center">
                    <div
                      id="print-label-area"
                      className="bg-white text-black"
                      style={{ width: "58mm", minHeight: "40mm", padding: "2.5mm", border: "1px solid #d9d9d9" }}
                    >
                      {printInclude.name && <p className="text-[11px] font-semibold leading-tight">{printDraft.name || "—"}</p>}
                      {printInclude.brand && <p className="text-[10px] leading-tight">{printDraft.brand || "—"}</p>}
                      {printInclude.legalEntity && <p className="text-[9px] leading-tight">{printDraft.legalEntity || "—"}</p>}
                      {(printInclude.color || printInclude.size) && (
                        <p className="text-[9px] leading-tight">
                          {printInclude.color ? `Цвет: ${printDraft.color || "—"}` : ""}
                          {printInclude.color && printInclude.size ? " · " : ""}
                          {printInclude.size ? `Размер: ${printDraft.size || "—"}` : ""}
                        </p>
                      )}
                      {printInclude.country && <p className="text-[9px] leading-tight">Страна: {printDraft.country || "—"}</p>}
                      {printInclude.supplierArticle && (
                        <p className="text-[9px] leading-tight">Арт.: {printDraft.supplierArticle || "—"}</p>
                      )}
                      {printInclude.barcode && printDraft.barcode && (
                        <div className="mt-1">
                          <Barcode
                            value={printDraft.barcode}
                            height={30}
                            width={1.35}
                            fontSize={9}
                            margin={0}
                            background="#ffffff"
                            displayValue
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => setPrintOpen(false)}>
                  Закрыть
                </Button>
                <Button type="button" className="gap-2" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Печать
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
