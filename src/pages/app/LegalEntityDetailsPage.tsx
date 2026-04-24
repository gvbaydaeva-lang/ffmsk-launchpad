import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import { Download, FileSpreadsheet, Plus, Printer, Upload } from "lucide-react";
import { ExcelColumnFilterMenu, ExcelThWithFilter } from "@/components/wms/ExcelColumnFilterMenu";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  canChangeInboundStatus,
  canChangeOutboundStatus,
  canCreateInbound,
  canCreateOutbound,
  canEditCatalog,
  canEditTariffs,
  useUserRole,
} from "@/contexts/UserRoleContext";
import {
  useInboundSupplies,
  useLegalEntities,
  useOperationHistory,
  useOutboundShipments,
  useProductCatalog,
  useUpdateLegalEntitySettings,
} from "@/hooks/useWmsMock";
import { persistOutboundDurably } from "@/services/mockOutbound";
import type { InboundLineItem, InboundSupply, Marketplace, OutboundShipment, ProductCatalogItem } from "@/types/domain";
import {
  EXCEL_STICKY_NAME_TD,
  EXCEL_STICKY_NAME_TH,
  EXCEL_STICKY_PHOTO_TD,
  EXCEL_STICKY_PHOTO_TH,
  EXCEL_TABLE_BASE,
  EXCEL_TABLE_WRAP,
  STATIC_HEADER_BASE,
  WAREHOUSE_COLUMN_CELL_BGS,
  WAREHOUSE_HEADER_CLASSES,
  excelRowBg,
} from "@/lib/excelTableStyles";
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

type InboundRowDraft = {
  supplierArticle: string;
  barcode: string;
  size: string;
  color: string;
  marketplace: "wb" | "ozon" | "yandex";
  plannedQuantity: string;
  factualQuantity: string;
};

type OutboundRowDraft = {
  productName: string;
  supplierArticle: string;
  barcode: string;
  size: string;
  color: string;
  marketplace: "wb" | "ozon" | "yandex";
  plannedUnits: string;
  factualUnits: string;
};

function buildOutboundRowDraftsFromShipments(
  outboundRowsForUi: OutboundShipment[],
  entityCatalogRows: ProductCatalogItem[],
  globalCatalog: ProductCatalogItem[] | undefined,
): Record<string, OutboundRowDraft> {
  const byEntity = new Map(entityCatalogRows.map((p) => [p.id, p]));
  const byGlobal = new Map((globalCatalog ?? []).map((p) => [p.id, p]));
  const next: Record<string, OutboundRowDraft> = {};
  for (const out of outboundRowsForUi) {
    const product = byEntity.get(out.productId) ?? byGlobal.get(out.productId) ?? null;
    next[out.id] = {
      productName: (product?.name || out.importName || "").trim() || out.importName || "",
      supplierArticle: (product?.supplierArticle || out.importArticle || "").trim() || out.importArticle || "",
      barcode: (product?.barcode || out.importBarcode || "").trim() || out.importBarcode || "",
      size: (product?.size || out.importSize || "").trim() || out.importSize || "",
      color: (product?.color || out.importColor || "").trim() || out.importColor || "",
      marketplace: out.marketplace,
      plannedUnits: String(out.plannedUnits),
      factualUnits: String(out.shippedUnits ?? out.packedUnits ?? 0),
    };
  }
  return next;
}

function buildInboundRowDraftsFromRows(inboundRows: InboundSupply[]): Record<string, InboundRowDraft> {
  const next: Record<string, InboundRowDraft> = {};
  for (const inb of inboundRows) {
    inb.items.forEach((it, idx) => {
      next[`${inb.id}-${idx}`] = {
        supplierArticle: it.supplierArticle,
        barcode: it.barcode,
        size: it.size,
        color: it.color,
        marketplace: inb.marketplace,
        plannedQuantity: String(it.plannedQuantity),
        factualQuantity: String(it.factualQuantity),
      };
    });
  }
  return next;
}

type InboundImportPreviewRow = {
  name: string;
  barcode: string;
  supplierArticle: string;
  color: string;
  size: string;
  plannedQuantity: number;
};

type OutboundImportPreviewRow = {
  name: string;
  barcode: string;
  supplierArticle: string;
  color: string;
  size: string;
  plannedUnits: number;
  sourceWarehouse: string;
  marketplace: "wb" | "ozon" | "yandex";
};

type OutboundMatrixCell = { shipments: OutboundShipment[]; planned: number; fact: number };
type OutboundMatrixLine = {
  key: string;
  /** Первая строка отгрузки в группе — черновики названия/артикула вешаем на неё */
  leaderShipmentId: string;
  name: string;
  article: string;
  barcode: string;
  color: string;
  size: string;
  marketplace: Marketplace;
  byWarehouse: Map<string, OutboundMatrixCell>;
  totalPlan: number;
  totalFact: number;
};

type InboundMatrixRowRef = { rowId: string; inboundId: string; rowIndex: number };
type InboundMatrixCell = { rowRefs: InboundMatrixRowRef[] };
type InboundMatrixLine = {
  key: string;
  leaderRowId: string;
  name: string;
  supplierArticle: string;
  barcode: string;
  color: string;
  size: string;
  marketplace: Marketplace;
  byWarehouse: Map<string, InboundMatrixCell>;
  /** Итоги по черновикам и строкам (для фильтра «расхождения» и подсветки) */
  totalPlan: number;
  totalFact: number;
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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeObjectKeys(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = v;
  return out;
}

function pickByAliases(row: Record<string, unknown>, aliases: string[]) {
  for (const key of aliases) {
    const hit = row[normalizeHeader(key)];
    if (hit !== undefined) return hit;
  }
  return "";
}

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function inboundMatrixLineKey(it: InboundLineItem): string {
  if (it.productId) return `p:${it.productId}`;
  const b = normalizeCode(it.barcode);
  const a = normalizeCode(it.supplierArticle);
  const sz = normalizeCode(it.size);
  const clr = normalizeCode(it.color);
  const nm = normalizeCode(it.name);
  return `o:${b}|${a}|${sz}|${clr}|${nm}`;
}

/** Стабильный псевдо-productId для строк импорта без позиции в каталоге (остаток не резервируется). */
function orphanProductIdForImport(entityId: string, row: OutboundImportPreviewRow): string {
  const b = normalizeCode(row.barcode);
  const a = normalizeCode(row.supplierArticle);
  const sz = normalizeCode(row.size);
  const clr = normalizeCode(row.color);
  const nm = normalizeCode(row.name);
  const wh = normalizeCode(row.sourceWarehouse);
  const key = `${b}|${a}|${sz}|${clr}|${nm}|${wh}`.replace(/[^a-z0-9|]+/gi, "").slice(0, 160) || "line";
  return `orphan:${entityId.trim()}:${key}`;
}

function matrixLineKey(sh: OutboundShipment, product: ProductCatalogItem | null): string {
  const article = (sh.importArticle || product?.supplierArticle || "").trim().toLowerCase();
  const barcode = (sh.importBarcode || product?.barcode || "").trim().toLowerCase();
  const size = (sh.importSize || product?.size || "").trim().toLowerCase();
  const color = (sh.importColor || product?.color || "").trim().toLowerCase();
  const name = (sh.importName || product?.name || "").trim().toLowerCase();
  if (!sh.productId.startsWith("orphan:")) {
    return `c:${sh.productId}`;
  }
  return `o:${barcode}|${article}|${size}|${color}|${name}`;
}

function findCatalogProductForOutbound(
  row: { barcode: string; supplierArticle: string },
  catalogRows: ProductCatalogItem[],
): ProductCatalogItem | null {
  const bc = text(row.barcode);
  const art = text(row.supplierArticle);
  if (bc) {
    const exact = catalogRows.find((p) => p.barcode === bc);
    if (exact) return exact;
    const bcTrim = bc.replace(/^0+/, "") || bc;
    const byLeadingZeros = catalogRows.find((p) => {
      const pTrim = p.barcode.replace(/^0+/, "") || p.barcode;
      return pTrim === bcTrim;
    });
    if (byLeadingZeros) return byLeadingZeros;
    const d = digitsOnly(bc);
    if (d.length >= 8) {
      const byDigits = catalogRows.find((p) => digitsOnly(p.barcode) === d);
      if (byDigits) return byDigits;
    }
  }
  if (art) {
    const byArticle = catalogRows.find((p) => p.supplierArticle === art);
    if (byArticle) return byArticle;
    const al = art.toLowerCase();
    return catalogRows.find((p) => p.supplierArticle.toLowerCase() === al) ?? null;
  }
  return null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { data: legal } = useLegalEntities();
  const { data: history } = useOperationHistory();
  const { data: inbound, createInbound, setInboundStatus, isCreating, isUpdatingInbound, updateInboundDraft } = useInboundSupplies();
  const { data: outbound, createOutbound, setOutboundStatus, isCreatingOutbound, isUpdatingOutbound, updateOutboundDraft } = useOutboundShipments();
  const { data: catalog, addProduct, updateProduct, isAddingProduct, isUpdatingProduct } = useProductCatalog();
  const { mutateAsync: updateSettings, isPending: isSavingSettings } = useUpdateLegalEntitySettings();
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [historyProductId, setHistoryProductId] = React.useState<string | null>(null);
  const [createInboundOpen, setCreateInboundOpen] = React.useState(false);
  const [createOutboundOpen, setCreateOutboundOpen] = React.useState(false);
  const [inboundExcelOpen, setInboundExcelOpen] = React.useState(false);
  const [outboundExcelOpen, setOutboundExcelOpen] = React.useState(false);
  const [inboundExcelRows, setInboundExcelRows] = React.useState<InboundImportPreviewRow[]>([]);
  const [outboundExcelRows, setOutboundExcelRows] = React.useState<OutboundImportPreviewRow[]>([]);
  const [excelRows, setExcelRows] = React.useState<Record<string, unknown>[]>([]);
  const [productSearch, setProductSearch] = React.useState("");
  const [selectedInboundProductId, setSelectedInboundProductId] = React.useState("");
  const [selectedOutboundProductId, setSelectedOutboundProductId] = React.useState("");
  const [inboundDraft, setInboundDraft] = React.useState({
    documentNo: "",
    supplier: "",
    quantity: "",
    marketplace: "wb" as "wb" | "ozon" | "yandex",
    warehouse: "Склад Коледино",
    eta: "",
  });
  const [outboundDraft, setOutboundDraft] = React.useState({
    quantity: "",
    marketplace: "wb" as "wb" | "ozon" | "yandex",
    warehouse: "Склад Коледино",
    shippingMethod: "fbo" as "fbo" | "fbs" | "self",
  });
  const [quickBarcode, setQuickBarcode] = React.useState("");
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [catalogSort, setCatalogSort] = React.useState<"name" | "barcode" | "article" | "stock">("name");
  const [catalogSortDir, setCatalogSortDir] = React.useState<"asc" | "desc">("asc");
  const [catalogColFilters, setCatalogColFilters] = React.useState<Record<string, string>>({});
  const [catalogPhotoViewer, setCatalogPhotoViewer] = React.useState<string | null>(null);
  const [recvColFilters, setRecvColFilters] = React.useState<Record<string, string>>({});
  const [recvSortKey, setRecvSortKey] = React.useState<"name" | "article" | "barcode" | "color" | "size" | "mp" | "plan" | "fact">("article");
  const [recvSortDir, setRecvSortDir] = React.useState<"asc" | "desc">("asc");
  const [shipColFilters, setShipColFilters] = React.useState<Record<string, string>>({});
  const [showOnlyDiff, setShowOnlyDiff] = React.useState(false);
  const [printCopies, setPrintCopies] = React.useState("1");
  const [rowDrafts, setRowDrafts] = React.useState<Record<string, RowDraft>>({});
  const [catalogEditingRows, setCatalogEditingRows] = React.useState<Record<string, boolean>>({});
  const [inboundMatrixEdit, setInboundMatrixEdit] = React.useState(false);
  /** Режим правки плана и полей отгрузки в матрице + поля коробов в сайдбаре упаковщика */
  const [shippingMatrixEdit, setShippingMatrixEdit] = React.useState(false);
  const [inboundRowDrafts, setInboundRowDrafts] = React.useState<Record<string, InboundRowDraft>>({});
  const [outboundRowDrafts, setOutboundRowDrafts] = React.useState<Record<string, OutboundRowDraft>>({});
  const [shippingSearch, setShippingSearch] = React.useState("");
  const [shippingSort, setShippingSort] = React.useState<
    "name" | "article" | "barcode" | "size" | "color" | "marketplace" | "warehouse" | "plan" | "fact"
  >("article");
  const [shipSortDir, setShipSortDir] = React.useState<"asc" | "desc">("asc");
  const [scanDraftByShipment, setScanDraftByShipment] = React.useState<Record<string, string>>({});
  const [scanErrorByShipment, setScanErrorByShipment] = React.useState<Record<string, boolean>>({});
  const [qrBoxPayload, setQrBoxPayload] = React.useState<{ barcode: string; warehouse: string } | null>(null);
  /** null — нет статуса; durable — IndexedDB+LS; durable+warn — облако не синхронизировалось */
  const [outboundPersistStatus, setOutboundPersistStatus] = React.useState<"durable" | "durable_warn" | "fail" | null>(null);
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
  const entityIdNorm = id.trim();
  /** Временная отладка: ?outboundDebug=1 — в таблице «Отгрузки» все строки из кэша без фильтра по юрлицу */
  const outboundDebugAll = searchParams.get("outboundDebug") === "1";
  const rows = React.useMemo(
    () => (catalog ?? []).filter((x) => (x.legalEntityId ?? "").trim() === entityIdNorm),
    [catalog, entityIdNorm],
  );
  const ops = React.useMemo(() => (history ?? []).filter((x) => x.legalEntityId === id), [history, id]);
  const inboundRows = React.useMemo(() => (inbound ?? []).filter((x) => x.legalEntityId === id), [inbound, id]);
  const outboundRows = React.useMemo(
    () => (outbound ?? []).filter((x) => (x.legalEntityId ?? "").trim() === entityIdNorm),
    [outbound, entityIdNorm],
  );
  const outboundRowsForUi = React.useMemo(
    () => (outboundDebugAll ? (outbound ?? []) : outboundRows) as OutboundShipment[],
    [outbound, outboundDebugAll, outboundRows],
  );
  const filteredProducts = React.useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((p) => p.name.toLowerCase().includes(s) || p.barcode.toLowerCase().includes(s));
  }, [rows, productSearch]);
  const catalogRows = React.useMemo(() => {
    const s = catalogSearch.trim().toLowerCase();
    const cf = catalogColFilters;
    const colHas = (key: string, val: string) => {
      const q = (cf[key] ?? "").trim().toLowerCase();
      if (!q) return true;
      return val.toLowerCase().includes(q);
    };
    let arr = rows.filter(
      (p) =>
        (!s ||
          p.name.toLowerCase().includes(s) ||
          p.barcode.toLowerCase().includes(s) ||
          p.supplierArticle.toLowerCase().includes(s)) &&
        colHas("photo", p.photoUrl ?? "") &&
        colHas("name", p.name) &&
        colHas("article", p.supplierArticle) &&
        colHas("barcode", p.barcode) &&
        colHas("color", p.color) &&
        colHas("size", p.size) &&
        colHas("country", p.countryOfOrigin) &&
        colHas("composition", p.composition) &&
        colHas("stock", String(p.stockOnHand)),
    );
    const d = catalogSortDir === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      if (catalogSort === "stock") return (a.stockOnHand - b.stockOnHand) * d;
      if (catalogSort === "barcode") return a.barcode.localeCompare(b.barcode, "ru") * d;
      if (catalogSort === "article") return a.supplierArticle.localeCompare(b.supplierArticle, "ru") * d;
      return a.name.localeCompare(b.name, "ru") * d;
    });
    return arr;
  }, [rows, catalogSearch, catalogSort, catalogSortDir, catalogColFilters]);
  const copies = Math.max(1, Number(printCopies) || 1);
  const historyProduct = historyProductId ? rows.find((p) => p.id === historyProductId) ?? null : null;
  const currentTab = searchParams.get("tab") ?? "catalog";
  const kpi = React.useMemo(
    () => ({
      inTransit: inboundRows.filter((x) => x.status !== "принято").reduce((s, x) => s + x.items.reduce((a, it) => a + it.plannedQuantity, 0), 0),
      onStock: rows.reduce((s, x) => s + x.stockOnHand, 0),
      reserved: outboundRows.filter((x) => x.status !== "отгружено").reduce((s, x) => s + x.plannedUnits, 0),
    }),
    [inboundRows, outboundRows, rows],
  );

  React.useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const item of rows) next[item.id] = rowToDraft(item);
    setRowDrafts(next);
  }, [rows]);

  React.useEffect(() => {
    setInboundRowDrafts(buildInboundRowDraftsFromRows(inboundRows));
  }, [inboundRows]);

  React.useEffect(() => {
    setOutboundRowDrafts(buildOutboundRowDraftsFromShipments(outboundRowsForUi, rows, catalog));
  }, [outboundRowsForUi, rows, catalog]);

  React.useEffect(() => {
    console.log("[wms:outbound] загрузка на страницу юрлица", {
      routeEntityId: entityIdNorm,
      totalInCache: (outbound ?? []).length,
      forThisEntity: outboundRows.length,
      sample: outboundRows.slice(0, 15).map((x) => ({
        id: x.id,
        legalEntityId: x.legalEntityId,
        productId: x.productId,
        assignmentId: x.assignmentId,
      })),
    });
  }, [entityIdNorm, outbound, outboundRows]);

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
          stockOnHand: 0,
          receiptHistory: [],
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
      stockOnHand: 0,
      receiptHistory: [],
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

  const onSaveInboundRow = async (inboundId: string, rowIndex: number, opts?: { quiet?: boolean }) => {
    const key = `${inboundId}-${rowIndex}`;
    const draft = inboundRowDrafts[key];
    const source = inboundRows.find((x) => x.id === inboundId);
    if (!draft || !source) return;
    const nextItems = source.items.map((it, idx) =>
      idx === rowIndex
        ? {
            ...it,
            supplierArticle: draft.supplierArticle.trim(),
            barcode: draft.barcode.trim(),
            size: draft.size.trim(),
            color: draft.color.trim(),
            plannedQuantity: Number(draft.plannedQuantity) || 0,
            factualQuantity: Number(draft.factualQuantity) || 0,
          }
        : it,
    );
    await updateInboundDraft({ id: inboundId, items: nextItems, marketplace: draft.marketplace });
    if (!opts?.quiet) toast.success("Строка приёмки сохранена");
  };

  const handleSaveAllInboundDrafts = async () => {
    for (const inb of inboundRows) {
      for (let idx = 0; idx < inb.items.length; idx += 1) {
        await onSaveInboundRow(inb.id, idx, { quiet: true });
      }
    }
    setInboundMatrixEdit(false);
    toast.success("Приёмки сохранены");
  };

  const cancelInboundMatrixEdit = () => {
    setInboundRowDrafts(buildInboundRowDraftsFromRows(inboundRows));
    setInboundMatrixEdit(false);
  };

  const patchInboundMatrixLineDrafts = (line: InboundMatrixLine, patch: Partial<InboundRowDraft>) => {
    const ids: string[] = [];
    line.byWarehouse.forEach((c) => c.rowRefs.forEach((r) => ids.push(r.rowId)));
    setInboundRowDrafts((s) => {
      const next = { ...s };
      for (const id of ids) {
        const cur = next[id];
        if (!cur) continue;
        next[id] = { ...cur, ...patch };
      }
      return next;
    });
  };

  const setInboundDraftPlanned = (rowId: string, planned: string) => {
    setInboundRowDrafts((s) => {
      const cur = s[rowId];
      if (!cur) return s;
      return { ...s, [rowId]: { ...cur, plannedQuantity: planned } };
    });
  };

  const setInboundDraftFactual = (rowId: string, factual: string) => {
    setInboundRowDrafts((s) => {
      const cur = s[rowId];
      if (!cur) return s;
      return { ...s, [rowId]: { ...cur, factualQuantity: factual } };
    });
  };

  const effInboundPlanned = (inboundId: string, rowIndex: number) => {
    const key = `${inboundId}-${rowIndex}`;
    const src = inboundRows.find((x) => x.id === inboundId)?.items[rowIndex];
    return Number(inboundRowDrafts[key]?.plannedQuantity ?? src?.plannedQuantity ?? 0) || 0;
  };

  const effInboundFactual = (inboundId: string, rowIndex: number) => {
    const key = `${inboundId}-${rowIndex}`;
    const src = inboundRows.find((x) => x.id === inboundId)?.items[rowIndex];
    return Number(inboundRowDrafts[key]?.factualQuantity ?? src?.factualQuantity ?? 0) || 0;
  };

  const onSaveOutboundRow = async (shipmentId: string, opts?: { quiet?: boolean }) => {
    const draft = outboundRowDrafts[shipmentId];
    const source = outboundRowsForUi.find((x) => x.id === shipmentId);
    if (!draft || !source) return;
    await updateOutboundDraft({
      id: shipmentId,
      patch: {
        marketplace: draft.marketplace,
        plannedUnits: Number(draft.plannedUnits) || 0,
        packedUnits: Number(draft.factualUnits) || 0,
        shippedUnits: Number(draft.factualUnits) || null,
        importName: draft.productName.trim() || undefined,
        importArticle: draft.supplierArticle.trim() || undefined,
        importBarcode: draft.barcode.trim() || undefined,
        importSize: draft.size.trim() || undefined,
        importColor: draft.color.trim() || undefined,
      },
    });
    if (source.productId.startsWith("orphan:")) {
      if (!opts?.quiet) toast.success("Строка отгрузки сохранена (без привязки к каталогу)");
      return;
    }
    const product = rows.find((p) => p.id === source.productId);
    if (product) {
      await updateProduct({
        id: product.id,
        patch: {
          supplierArticle: draft.supplierArticle.trim(),
          barcode: draft.barcode.trim(),
          size: draft.size.trim(),
          color: draft.color.trim(),
        },
      });
    }
    if (!opts?.quiet) toast.success("Строка отгрузки сохранена");
  };

  const handleSaveAllShippingDrafts = async () => {
    for (const sh of outboundRowsForUi) {
      if (outboundRowDrafts[sh.id]) await onSaveOutboundRow(sh.id, { quiet: true });
    }
    setShippingMatrixEdit(false);
    toast.success("Отгрузки сохранены");
  };

  const cancelShippingMatrixEdit = () => {
    setOutboundRowDrafts(buildOutboundRowDraftsFromShipments(outboundRowsForUi, rows, catalog));
    setShippingMatrixEdit(false);
  };

  const patchOutboundMatrixLineDrafts = (line: OutboundMatrixLine, patch: Partial<OutboundRowDraft>) => {
    const ids: string[] = [];
    line.byWarehouse.forEach((c) => c.shipments.forEach((sh) => ids.push(sh.id)));
    setOutboundRowDrafts((s) => {
      const next = { ...s };
      for (const id of ids) {
        const cur = next[id];
        if (!cur) continue;
        next[id] = { ...cur, ...patch };
      }
      return next;
    });
  };

  const setShipmentDraftPlanned = (shipmentId: string, planned: string) => {
    setOutboundRowDrafts((s) => {
      const cur = s[shipmentId];
      if (!cur) return s;
      return { ...s, [shipmentId]: { ...cur, plannedUnits: planned } };
    });
  };

  const effOutboundPlanned = (sh: OutboundShipment) =>
    Number(outboundRowDrafts[sh.id]?.plannedUnits ?? sh.plannedUnits) || 0;
  const effOutboundFact = (sh: OutboundShipment) =>
    Number(outboundRowDrafts[sh.id]?.factualUnits ?? sh.shippedUnits ?? sh.packedUnits ?? 0) || 0;

  const beepError = () => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.12;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.14);
  };

  const shippingRows = React.useMemo(() => {
    const productByEntity = new Map(rows.map((p) => [p.id, p]));
    const productByGlobal = new Map((catalog ?? []).map((p) => [p.id, p]));
    const s = shippingSearch.trim().toLowerCase();
    const arr = outboundRowsForUi
      .map((x) => {
        const product = productByEntity.get(x.productId) ?? productByGlobal.get(x.productId) ?? null;
        const draft = outboundRowDrafts[x.id];
        const article =
          (draft?.supplierArticle || "").trim() ||
          (product?.supplierArticle || "").trim() ||
          (x.importArticle || "").trim() ||
          "";
        const barcode =
          (draft?.barcode || "").trim() ||
          (product?.barcode || "").trim() ||
          (x.importBarcode || "").trim() ||
          "";
        const name =
          (draft?.productName || "").trim() || (product?.name || "").trim() || (x.importName || "").trim() || "";
        return {
          shipment: x,
          name,
          article,
          barcode,
          size: (draft?.size || "").trim() || product?.size || x.importSize || "",
          color: (draft?.color || "").trim() || product?.color || x.importColor || "",
          marketplace: draft?.marketplace ?? x.marketplace,
          warehouse: x.sourceWarehouse,
          plan: Number(draft?.plannedUnits ?? x.plannedUnits ?? 0) || 0,
          fact: Number(draft?.factualUnits ?? (x.shippedUnits ?? x.packedUnits ?? 0)) || 0,
        };
      })
      .filter((r) => {
        if (!s) return true;
        return [r.name, r.article, r.barcode, r.size, r.color, r.marketplace, r.warehouse].some((v) =>
          String(v).toLowerCase().includes(s),
        );
      });
    const sd = shipSortDir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (shippingSort === "plan") return (a.plan - b.plan) * sd;
      if (shippingSort === "fact") return (a.fact - b.fact) * sd;
      if (shippingSort === "name") return a.name.localeCompare(b.name, "ru") * sd;
      return String(a[shippingSort]).localeCompare(String(b[shippingSort]), "ru") * sd;
    });
  }, [outboundRowsForUi, outboundRowDrafts, rows, catalog, shippingSearch, shippingSort, shipSortDir]);

  const shippingMatrix = React.useMemo(() => {
    const productByEntity = new Map(rows.map((p) => [p.id, p]));
    const productByGlobal = new Map((catalog ?? []).map((p) => [p.id, p]));
    const warehousesSet = new Set<string>();
    const lines = new Map<string, OutboundMatrixLine>();
    const search = shippingSearch.trim().toLowerCase();

    for (const sh of outboundRowsForUi) {
      warehousesSet.add(sh.sourceWarehouse || "—");
      const product = productByEntity.get(sh.productId) ?? productByGlobal.get(sh.productId) ?? null;
      const key = matrixLineKey(sh, product);
      const name = (product?.name || "").trim() || (sh.importName || "").trim() || "";
      const article = (product?.supplierArticle || "").trim() || (sh.importArticle || "").trim() || "";
      const barcode = (product?.barcode || "").trim() || (sh.importBarcode || "").trim() || "";
      const color = (product?.color || "").trim() || (sh.importColor || "").trim() || "";
      const size = (product?.size || "").trim() || (sh.importSize || "").trim() || "";
      const wh = sh.sourceWarehouse || "—";

      let line = lines.get(key);
      if (!line) {
        line = {
          key,
          leaderShipmentId: sh.id,
          name,
          article,
          barcode,
          color,
          size,
          marketplace: sh.marketplace,
          byWarehouse: new Map(),
          totalPlan: 0,
          totalFact: 0,
        };
        lines.set(key, line);
      } else {
        line.name = (line.name || "").trim() || (name || "").trim() || line.name;
        line.article = (line.article || "").trim() || (article || "").trim() || line.article;
        line.barcode = (line.barcode || "").trim() || (barcode || "").trim() || line.barcode;
        line.color = (line.color || "").trim() || (color || "").trim() || line.color;
        line.size = (line.size || "").trim() || (size || "").trim() || line.size;
      }
      const cell = line.byWarehouse.get(wh) ?? { shipments: [], planned: 0, fact: 0 };
      cell.shipments.push(sh);
      cell.planned += sh.plannedUnits;
      cell.fact += sh.shippedUnits ?? sh.packedUnits ?? 0;
      line.byWarehouse.set(wh, cell);
      line.totalPlan += sh.plannedUnits;
      line.totalFact += sh.shippedUnits ?? sh.packedUnits ?? 0;
    }

    const warehouses = Array.from(warehousesSet).sort((a, b) => a.localeCompare(b, "ru"));
    let matrixLines = Array.from(lines.values());

    if (search) {
      matrixLines = matrixLines.filter(
        (line) =>
          [line.name, line.article, line.barcode, line.color, line.size, line.marketplace].some((f) =>
            String(f).toLowerCase().includes(search),
          ) || Array.from(line.byWarehouse.keys()).some((w) => w.toLowerCase().includes(search)),
      );
    }

    const sf = shipColFilters;
    const shipColOk = (key: string, val: string) => {
      const q = (sf[key] ?? "").trim().toLowerCase();
      if (!q) return true;
      return String(val).toLowerCase().includes(q);
    };
    matrixLines = matrixLines.filter(
      (line) =>
        shipColOk("name", line.name) &&
        shipColOk("article", line.article) &&
        shipColOk("barcode", line.barcode) &&
        shipColOk("color", line.color) &&
        shipColOk("size", line.size) &&
        shipColOk("mp", line.marketplace) &&
        shipColOk("plan", String(line.totalPlan)) &&
        shipColOk("fact", String(line.totalFact)),
    );

    const sd = shipSortDir === "asc" ? 1 : -1;
    matrixLines.sort((a, b) => {
      if (shippingSort === "plan") return (a.totalPlan - b.totalPlan) * sd;
      if (shippingSort === "fact") return (a.totalFact - b.totalFact) * sd;
      if (shippingSort === "name") return a.name.localeCompare(b.name, "ru") * sd;
      if (shippingSort === "barcode") return a.barcode.localeCompare(b.barcode, "ru") * sd;
      if (shippingSort === "size") return a.size.localeCompare(b.size, "ru") * sd;
      if (shippingSort === "color") return a.color.localeCompare(b.color, "ru") * sd;
      if (shippingSort === "marketplace") return a.marketplace.localeCompare(b.marketplace, "ru") * sd;
      if (shippingSort === "warehouse") {
        const wa = Array.from(a.byWarehouse.keys())
          .sort((x, y) => x.localeCompare(y, "ru"))
          .join("|");
        const wb = Array.from(b.byWarehouse.keys())
          .sort((x, y) => x.localeCompare(y, "ru"))
          .join("|");
        return wa.localeCompare(wb, "ru") * sd;
      }
      return a.article.localeCompare(b.article, "ru") * sd;
    });

    return { warehouses, lines: matrixLines };
  }, [outboundRowsForUi, rows, catalog, shippingSearch, shippingSort, shipSortDir, shipColFilters]);

  const receivingMatrix = React.useMemo(() => {
    const draftP = (inboundId: string, rowIndex: number) => {
      const k = `${inboundId}-${rowIndex}`;
      const src = inboundRows.find((i) => i.id === inboundId)?.items[rowIndex];
      return Number(inboundRowDrafts[k]?.plannedQuantity ?? src?.plannedQuantity ?? 0) || 0;
    };
    const draftF = (inboundId: string, rowIndex: number) => {
      const k = `${inboundId}-${rowIndex}`;
      const src = inboundRows.find((i) => i.id === inboundId)?.items[rowIndex];
      return Number(inboundRowDrafts[k]?.factualQuantity ?? src?.factualQuantity ?? 0) || 0;
    };

    const warehousesSet = new Set<string>();
    const lines = new Map<string, InboundMatrixLine>();
    const flat = inboundRows.flatMap((inb) =>
      inb.items.map((it, idx) => ({
        rowId: `${inb.id}-${idx}`,
        inboundId: inb.id,
        rowIndex: idx,
        item: it,
        marketplace: inb.marketplace,
        warehouse: inb.destinationWarehouse || "—",
      })),
    );

    for (const x of flat) {
      warehousesSet.add(x.warehouse);
      const key = inboundMatrixLineKey(x.item);
      let line = lines.get(key);
      if (!line) {
        line = {
          key,
          leaderRowId: x.rowId,
          name: x.item.name,
          supplierArticle: x.item.supplierArticle,
          barcode: x.item.barcode,
          color: x.item.color,
          size: x.item.size,
          marketplace: x.marketplace,
          byWarehouse: new Map(),
          totalPlan: 0,
          totalFact: 0,
        };
        lines.set(key, line);
      } else {
        const nm = (x.item.name || "").trim();
        if (!(line.name || "").trim() && nm) line.name = nm;
        if (!(line.supplierArticle || "").trim() && (x.item.supplierArticle || "").trim()) line.supplierArticle = x.item.supplierArticle;
        if (!(line.barcode || "").trim() && (x.item.barcode || "").trim()) line.barcode = x.item.barcode;
        if (!(line.color || "").trim() && (x.item.color || "").trim()) line.color = x.item.color;
        if (!(line.size || "").trim() && (x.item.size || "").trim()) line.size = x.item.size;
      }
      const cell = line.byWarehouse.get(x.warehouse) ?? { rowRefs: [] };
      cell.rowRefs.push({ rowId: x.rowId, inboundId: x.inboundId, rowIndex: x.rowIndex });
      line.byWarehouse.set(x.warehouse, cell);
    }

    let matrixLines: InboundMatrixLine[] = Array.from(lines.values()).map((line) => {
      let tp = 0;
      let tf = 0;
      line.byWarehouse.forEach((c) => {
        c.rowRefs.forEach((r) => {
          tp += draftP(r.inboundId, r.rowIndex);
          tf += draftF(r.inboundId, r.rowIndex);
        });
      });
      return { ...line, totalPlan: tp, totalFact: tf };
    });

    if (showOnlyDiff) {
      matrixLines = matrixLines.filter((l) => l.totalPlan !== l.totalFact);
    }

    const rf = recvColFilters;
    const recvColOk = (key: string, val: string) => {
      const q = (rf[key] ?? "").trim().toLowerCase();
      if (!q) return true;
      return String(val).toLowerCase().includes(q);
    };
    matrixLines = matrixLines.filter(
      (line) =>
        recvColOk("name", line.name) &&
        recvColOk("article", line.supplierArticle) &&
        recvColOk("barcode", line.barcode) &&
        recvColOk("color", line.color) &&
        recvColOk("size", line.size) &&
        recvColOk("mp", line.marketplace) &&
        recvColOk("plan", String(line.totalPlan)) &&
        recvColOk("fact", String(line.totalFact)),
    );

    const dir = recvSortDir === "asc" ? 1 : -1;
    matrixLines.sort((a, b) => {
      if (recvSortKey === "name") return a.name.localeCompare(b.name, "ru") * dir;
      if (recvSortKey === "barcode") return a.barcode.localeCompare(b.barcode, "ru") * dir;
      if (recvSortKey === "color") return a.color.localeCompare(b.color, "ru") * dir;
      if (recvSortKey === "size") return a.size.localeCompare(b.size, "ru") * dir;
      if (recvSortKey === "mp") return a.marketplace.localeCompare(b.marketplace, "ru") * dir;
      if (recvSortKey === "plan") return (a.totalPlan - b.totalPlan) * dir;
      if (recvSortKey === "fact") return (a.totalFact - b.totalFact) * dir;
      return a.supplierArticle.localeCompare(b.supplierArticle, "ru") * dir;
    });

    const warehouses = Array.from(warehousesSet).sort((a, b) => a.localeCompare(b, "ru"));
    return { warehouses, lines: matrixLines };
  }, [inboundRows, inboundRowDrafts, showOnlyDiff, recvColFilters, recvSortKey, recvSortDir]);

  const onAddBox = async (shipmentId: string) => {
    const row = outboundRowsForUi.find((x) => x.id === shipmentId);
    if (!row) return;
    const nextBox = {
      id: `box-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clientBoxBarcode: "",
      scannedBarcodes: [] as string[],
    };
    await updateOutboundDraft({
      id: shipmentId,
      patch: {
        boxes: [...(row.boxes ?? []), nextBox],
        activeBoxId: nextBox.id,
        status: "к отгрузке",
      },
    });
    toast.success("Короб добавлен");
  };

  const barcodesMatch = (a: string, b: string) => {
    const A = a.trim();
    const B = b.trim();
    if (!A || !B) return false;
    if (A === B) return true;
    const da = digitsOnly(A);
    const db = digitsOnly(B);
    if (da.length >= 8 && da === db) return true;
    const at = A.replace(/^0+/, "") || A;
    const bt = B.replace(/^0+/, "") || B;
    return at === bt;
  };

  const onScanIntoActiveBox = async (shipmentId: string) => {
    const row = outboundRowsForUi.find((x) => x.id === shipmentId);
    const scanned = (scanDraftByShipment[shipmentId] ?? "").trim();
    const barcode =
      outboundRowDrafts[shipmentId]?.barcode ??
      rows.find((p) => p.id === row?.productId)?.barcode ??
      row?.importBarcode ??
      "";
    if (!row || !row.activeBoxId) {
      return toast.error(
        (row.boxes ?? []).length ? "Выберите активный короб — кнопка «Открыть»" : "Сначала нажмите «Добавить короб»",
      );
    }
    if (!scanned) return toast.error("Введите баркод для сканирования");
    if (!barcodesMatch(scanned, barcode)) {
      setScanErrorByShipment((s) => ({ ...s, [shipmentId]: true }));
      beepError();
      return toast.error("Баркод не входит в план отгрузки");
    }
    const boxes = row.boxes ?? [];
    const active = boxes.find((b) => b.id === row.activeBoxId);
    if (!active) return toast.error("Активный короб не найден");
    const currentPacked = boxes.reduce((sum, b) => sum + b.scannedBarcodes.length, 0);
    if (currentPacked + 1 > row.plannedUnits) {
      setScanErrorByShipment((s) => ({ ...s, [shipmentId]: true }));
      beepError();
      return toast.error("Превышение плана");
    }
    const nextBoxes = boxes.map((b) => (b.id === row.activeBoxId ? { ...b, scannedBarcodes: [...b.scannedBarcodes, scanned] } : b));
    setScanErrorByShipment((s) => ({ ...s, [shipmentId]: false }));
    setScanDraftByShipment((s) => ({ ...s, [shipmentId]: "" }));
    await updateOutboundDraft({
      id: shipmentId,
      patch: {
        boxes: nextBoxes,
        packedUnits: currentPacked + 1,
      },
    });
  };

  const exportPackingExcelFromBoxes = () => {
    const rowsExport: Array<Record<string, string | number>> = [];
    for (const out of outboundRowsForUi) {
      const boxes = out.boxes ?? [];
      const productBarcode =
        outboundRowDrafts[out.id]?.barcode ??
        rows.find((p) => p.id === out.productId)?.barcode ??
        out.importBarcode ??
        "";
      for (const box of boxes) {
        const boxSk = box.clientBoxBarcode || box.id;
        for (const scanned of box.scannedBarcodes) {
          rowsExport.push({
            "Баркод товара": scanned || productBarcode,
            "Кол-во товаров": 1,
            "ШК короба": boxSk,
            "Срок годности": out.expiryDate || "",
          });
        }
      }
    }
    if (!rowsExport.length) return toast.error("Нет данных для выгрузки");
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Упаковка");
    XLSX.writeFile(wb, "shk-excel-export.xlsx");
  };

  const onUploadPhoto = async (idProduct: string, file: File) => {
    const url = URL.createObjectURL(file);
    await updateProduct({ id: idProduct, patch: { photoUrl: url } });
    toast.success("Фото загружено");
  };

  const onCreateInbound = async () => {
    if (!entity || !selectedInboundProductId) return toast.error("Выберите товар");
    const qty = Number(inboundDraft.quantity);
    if (!qty || qty <= 0) return toast.error("Укажите корректное количество");
    const product = rows.find((p) => p.id === selectedInboundProductId);
    if (!product) return toast.error("Товар не найден");
    await createInbound({
      legalEntityId: entity.id,
      documentNo: inboundDraft.documentNo.trim() || `ПТ-${Date.now().toString().slice(-6)}`,
      supplier: inboundDraft.supplier.trim() || "Клиент",
      items: [
        {
          productId: selectedInboundProductId,
          barcode: product.barcode,
          supplierArticle: product.supplierArticle,
          name: product.name,
          color: product.color,
          size: product.size,
          plannedQuantity: qty,
          factualQuantity: 0,
        },
      ],
      destinationWarehouse: inboundDraft.warehouse.trim() || "Склад Коледино",
      marketplace: inboundDraft.marketplace,
      expectedUnits: qty,
      receivedUnits: null,
      status: "ожидается",
      eta: inboundDraft.eta || new Date().toISOString().slice(0, 10),
    });
    toast.success("Задание на приёмку создано");
    setCreateInboundOpen(false);
    setInboundDraft({ documentNo: "", supplier: "", quantity: "", marketplace: "wb", warehouse: "Склад Коледино", eta: "" });
    setSelectedInboundProductId("");
  };

  const onCreateOutbound = async () => {
    if (!entity || !selectedOutboundProductId) return toast.error("Выберите товар");
    const qty = Number(outboundDraft.quantity);
    const product = rows.find((p) => p.id === selectedOutboundProductId);
    if (!qty || qty <= 0) return toast.error("Укажите корректное количество");
    if (!product || qty > product.stockOnHand) return toast.error("Количество превышает остаток");
    await createOutbound({
      legalEntityId: entity.id.trim(),
      productId: selectedOutboundProductId,
      marketplace: outboundDraft.marketplace,
      sourceWarehouse: outboundDraft.warehouse.trim() || "Склад Коледино",
      shippingMethod: outboundDraft.shippingMethod,
      boxBarcode: "",
      gateBarcode: "",
      supplyNumber: "",
      expiryDate: "",
      packedUnits: 0,
      plannedShipDate: null,
      plannedUnits: qty,
      shippedUnits: null,
      status: "готов к отгрузке (резерв)",
      boxes: [],
      activeBoxId: null,
    });
    toast.success("Задание на отгрузку создано");
    setCreateOutboundOpen(false);
    setOutboundDraft({ quantity: "", marketplace: "wb", warehouse: "Склад Коледино", shippingMethod: "fbo" });
    setSelectedOutboundProductId("");
  };

  const downloadInboundTaskTemplate = () => {
    const headers = [["Название", "Баркод", "Артикул", "Цвет", "Размер", "Количество заявленное"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Приемка");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inbound_tasks_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadOutboundTaskTemplate = () => {
    const headers = [["Название", "Баркод", "Артикул", "Цвет", "Размер", "Количество", "Склад назначения", "Маркетплейс"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Отгрузка");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "outbound_tasks_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseExcelRows = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames.includes("Отгрузка") ? "Отгрузка" : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  };

  const findProductByInboundPreview = (row: InboundImportPreviewRow) => {
    const barcode = text(row.barcode);
    const article = text(row.supplierArticle);
    if (barcode) {
      const byBarcode = rows.find((p) => p.barcode === barcode);
      if (byBarcode) return byBarcode;
    }
    if (article) {
      const byArticle = rows.find((p) => p.supplierArticle === article);
      if (byArticle) return byArticle;
    }
    return null;
  };

  const findProductByRow = (row: Record<string, unknown>) => {
    const normalized = normalizeObjectKeys(row);
    const barcode = text(pickByAliases(normalized, ["Баркод", "Баркод товара"]));
    const article = text(pickByAliases(normalized, ["Артикул", "Vendor Code", "vendor code"]));
    if (barcode) {
      const byBarcode = rows.find((p) => p.barcode === barcode);
      if (byBarcode) return byBarcode;
    }
    if (article) {
      const byArticle = rows.find((p) => p.supplierArticle === article);
      if (byArticle) return byArticle;
    }
    return null;
  };

  const parseInboundImportRows = (raw: Record<string, unknown>[]) => {
    return raw.map((entry) => {
      const row = normalizeObjectKeys(entry);
      const plannedRaw = pickByAliases(row, ["Количество заявленное", "Кол-во", "План", "план ", "Плановое количество"]);
      const planned = Number(String(plannedRaw).replace(",", "."));
      return {
        name: text(pickByAliases(row, ["Название"])),
        barcode: text(pickByAliases(row, ["Баркод"])),
        supplierArticle: text(pickByAliases(row, ["Артикул", "Vendor Code", "vendor code"])),
        color: text(pickByAliases(row, ["Цвет"])),
        size: text(pickByAliases(row, ["Размер"])),
        plannedQuantity: Number.isFinite(planned) ? planned : 0,
      } satisfies InboundImportPreviewRow;
    });
  };

  const parseOutboundImportRows = (raw: Record<string, unknown>[]) => {
    return raw.map((entry) => {
      const row = normalizeObjectKeys(entry);
      const qtyRaw = pickByAliases(row, ["Количество", "Кол-во", "План", "Кол-во товаров"]);
      const directQty = Number(String(qtyRaw).replace(",", "."));
      const warehouseSum = Object.entries(row)
        .filter(([k]) =>
          ["склад", "невинномысск", "котовск", "рязань", "екб", "шушары"].some((needle) => k.includes(needle)),
        )
        .reduce((sum, [, v]) => {
          const n = Number(String(v).replace(",", "."));
          return Number.isFinite(n) ? sum + n : sum;
        }, 0);
      const plannedUnits = Number.isFinite(directQty) && directQty > 0 ? directQty : warehouseSum;
      const wh = text(pickByAliases(row, ["Склад назначения", "Склад", "Склад 1"])) || "Склад Коледино";
      const mpRaw = text(pickByAliases(row, ["Маркетплейс", "Площадка"])).toLowerCase();
      const marketplace = mpRaw === "ozon" ? "ozon" : mpRaw === "yandex" ? "yandex" : "wb";
      return {
        name: text(pickByAliases(row, ["Название", "Название товара", "Name", "name"])),
        barcode: text(
          pickByAliases(row, [
            "Баркод",
            "Баркод товара",
            "Barcode",
            "barcode",
            "ШК",
            "ШК товара",
            "SKU",
            "sku",
          ]),
        ),
        supplierArticle: text(
          pickByAliases(row, [
            "Артикул",
            "Vendor Code",
            "vendor code",
            "Vendor code",
            "Артикул поставщика",
            "Article",
            "article",
            "vendor_code",
            "Vendor_article",
          ]),
        ),
        color: text(pickByAliases(row, ["Цвет"])),
        size: text(pickByAliases(row, ["Размер"])),
        plannedUnits,
        sourceWarehouse: wh,
        marketplace,
      } satisfies OutboundImportPreviewRow;
    });
  };

  const importInboundExcel = async () => {
    if (!entity) return;
    let skipped = 0;
    const docNo = `ПТ-${Date.now().toString().slice(-6)}`;
    const dedupedByBarcode = new Map<string, InboundImportPreviewRow>();
    for (const row of inboundExcelRows) {
      const key = normalizeCode(row.barcode);
      if (!key) {
        skipped += 1;
        continue;
      }
      const prev = dedupedByBarcode.get(key);
      if (!prev) {
        dedupedByBarcode.set(key, { ...row });
      } else {
        dedupedByBarcode.set(key, {
          ...prev,
          plannedQuantity: prev.plannedQuantity + (Number(row.plannedQuantity) || 0),
        });
      }
    }

    const items: Array<{
      productId?: string;
      barcode: string;
      supplierArticle: string;
      name: string;
      color: string;
      size: string;
      plannedQuantity: number;
      factualQuantity: number;
    }> = [];
    for (const row of dedupedByBarcode.values()) {
      const product = findProductByInboundPreview(row);
      if (!product) {
        skipped += 1;
        continue;
      }
      items.push({
        productId: product.id,
        barcode: row.barcode || product.barcode,
        supplierArticle: row.supplierArticle || product.supplierArticle,
        name: row.name || product.name,
        color: row.color || product.color,
        size: row.size || product.size,
        plannedQuantity: Number(row.plannedQuantity) || 0,
        factualQuantity: 0,
      });
    }
    if (!items.length) {
      toast.error("Нет валидных строк для импорта");
      return;
    }
    const totalPlanned = items.reduce((s, it) => s + it.plannedQuantity, 0);
    await createInbound({
      legalEntityId: entity.id,
      documentNo: docNo,
      supplier: "Импорт Excel",
      items,
      destinationWarehouse: "Склад Коледино",
      marketplace: "wb",
      expectedUnits: totalPlanned,
      receivedUnits: null,
      status: "ожидается",
      eta: new Date().toISOString().slice(0, 10),
    });
    toast.success(`Успешно загружено ${items.length} уникальных строк`);
    if (skipped > 0) toast.message(`Пропущено строк: ${skipped}`);
    setInboundExcelOpen(false);
    setInboundExcelRows([]);
  };

  const importOutboundExcel = async () => {
    if (!entity) return;
    let created = 0;
    let mergedWithExisting = 0;
    let skipped = 0;
    const assignmentId = `ass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assignmentNo = `ОТГ-${Date.now().toString().slice(-8)}`;
    const deduped = new Map<string, OutboundImportPreviewRow>();
    for (const row of outboundExcelRows) {
      const key = normalizeCode(row.barcode) || `art:${normalizeCode(row.supplierArticle)}`;
      if (!key || key === "art:") {
        skipped += 1;
        continue;
      }
      const prev = deduped.get(key);
      if (!prev) deduped.set(key, { ...row });
      else
        deduped.set(key, {
          ...prev,
          plannedUnits: prev.plannedUnits + (row.plannedUnits || 0),
          name: prev.name || row.name,
          size: prev.size || row.size,
          color: prev.color || row.color,
        });
    }
    const stockLeft = new Map<string, number>();
    for (const p of rows) stockLeft.set(p.id, p.stockOnHand);
    const entityIdTrim = entity.id.trim();

    const mergeOrCreateOrphan = async (row: OutboundImportPreviewRow, planned: number) => {
      const orphanPid = orphanProductIdForImport(entityIdTrim, row);
      const fresh = queryClient.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? [];
      const existing = fresh.find(
        (x) =>
          (x.legalEntityId ?? "").trim() === entityIdTrim &&
          x.productId === orphanPid &&
          x.status !== "отгружено" &&
          x.sourceWarehouse === row.sourceWarehouse &&
          x.assignmentId === assignmentId,
      );
      if (existing) {
        await updateOutboundDraft({
          id: existing.id,
          patch: {
            plannedUnits: existing.plannedUnits + planned,
            marketplace: row.marketplace,
            importName: text(row.name) || existing.importName,
            importArticle: text(row.supplierArticle) || existing.importArticle,
            importBarcode: text(row.barcode) || existing.importBarcode,
            importSize: text(row.size) || existing.importSize,
            importColor: text(row.color) || existing.importColor,
          },
        });
        mergedWithExisting += 1;
        return;
      }
      await createOutbound({
        legalEntityId: entityIdTrim,
        productId: orphanPid,
        assignmentId,
        assignmentNo,
        importName: text(row.name) || undefined,
        importArticle: text(row.supplierArticle) || undefined,
        importBarcode: text(row.barcode) || undefined,
        importSize: text(row.size) || undefined,
        importColor: text(row.color) || undefined,
        marketplace: row.marketplace,
        sourceWarehouse: row.sourceWarehouse,
        shippingMethod: "fbo",
        boxBarcode: "",
        gateBarcode: "",
        supplyNumber: "",
        expiryDate: "",
        packedUnits: 0,
        plannedShipDate: null,
        plannedUnits: planned,
        shippedUnits: null,
        status: "готов к отгрузке (резерв)",
        boxes: [],
        activeBoxId: null,
      });
      created += 1;
    };

    for (const row of deduped.values()) {
      const wantQty = Number(row.plannedUnits) || 0;
      if (wantQty <= 0) {
        skipped += 1;
        continue;
      }
      const product = findCatalogProductForOutbound(row, rows);
      if (!product) {
        await mergeOrCreateOrphan(row, wantQty);
        continue;
      }
      const available = stockLeft.get(product.id) ?? 0;
      const qty = Math.min(wantQty, available);
      if (qty <= 0) {
        await mergeOrCreateOrphan(row, wantQty);
        continue;
      }
      stockLeft.set(product.id, available - qty);

      const allOutbound = queryClient.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? [];
      const existing = allOutbound.find(
        (x) =>
          (x.legalEntityId ?? "").trim() === entityIdTrim &&
          x.productId === product.id &&
          x.status !== "отгружено" &&
          x.sourceWarehouse === row.sourceWarehouse &&
          x.assignmentId === assignmentId,
      );
      if (existing) {
        await updateOutboundDraft({
          id: existing.id,
          patch: {
            plannedUnits: existing.plannedUnits + qty,
            marketplace: row.marketplace,
            importName: text(row.name) || existing.importName,
            importArticle: text(row.supplierArticle) || existing.importArticle,
            importBarcode: text(row.barcode) || existing.importBarcode,
            importSize: text(row.size) || existing.importSize,
            importColor: text(row.color) || existing.importColor,
          },
        });
        mergedWithExisting += 1;
        continue;
      }
      await createOutbound({
        legalEntityId: entityIdTrim,
        productId: product.id,
        assignmentId,
        assignmentNo,
        importName: text(row.name) || product.name || undefined,
        importArticle: text(row.supplierArticle) || product.supplierArticle || undefined,
        importBarcode: text(row.barcode) || product.barcode || undefined,
        importSize: text(row.size) || product.size || undefined,
        importColor: text(row.color) || product.color || undefined,
        marketplace: row.marketplace,
        sourceWarehouse: row.sourceWarehouse,
        shippingMethod: "fbo",
        boxBarcode: "",
        gateBarcode: "",
        supplyNumber: "",
        expiryDate: "",
        packedUnits: 0,
        plannedShipDate: null,
        plannedUnits: qty,
        shippedUnits: null,
        status: "готов к отгрузке (резерв)",
        boxes: [],
        activeBoxId: null,
      });
      created += 1;
    }
    const currentAll = queryClient.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? outbound ?? [];
    const { durable, supabaseOk } = await persistOutboundDurably(currentAll);
    const latestOutbound = queryClient.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? currentAll;
    queryClient.setQueryData(["wms", "outbound"], [...latestOutbound]);
    await queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    await queryClient.refetchQueries({ queryKey: ["wms", "outbound"] });
    if (!durable) {
      setOutboundPersistStatus("fail");
      toast.error(
        `Импорт отгрузки: добавлено ${created}, объединено ${mergedWithExisting}, пропущено ${skipped}. Не удалось записать в локальное хранилище (IndexedDB).`,
      );
    } else if (!supabaseOk) {
      setOutboundPersistStatus("durable_warn");
      toast.success(
        `Импорт отгрузки: добавлено ${created}, объединено ${mergedWithExisting}, пропущено ${skipped}. Сохранено локально; синхронизация с Supabase не удалась.`,
      );
    } else {
      setOutboundPersistStatus("durable");
      toast.success(`Импорт отгрузки: добавлено ${created}, объединено ${mergedWithExisting}, пропущено ${skipped}. Данные записаны.`);
    }
    setOutboundExcelOpen(false);
    setOutboundExcelRows([]);
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-200"><CardContent className="p-4"><p className="text-xs text-slate-500">В пути</p><p className="mt-1 text-2xl font-semibold">{kpi.inTransit}</p></CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-4"><p className="text-xs text-slate-500">На складе</p><p className="mt-1 text-2xl font-semibold">{kpi.onStock}</p></CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-4"><p className="text-xs text-slate-500">В резерве / к отгрузке</p><p className="mt-1 text-2xl font-semibold">{kpi.reserved}</p></CardContent></Card>
      </div>

      <Tabs value={currentTab} onValueChange={(tab) => setSearchParams({ tab })} className="w-full">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="catalog">Каталог товаров</TabsTrigger>
          <TabsTrigger value="receiving">Приёмки</TabsTrigger>
          <TabsTrigger value="shipping">Отгрузки</TabsTrigger>
          <TabsTrigger value="history">История операций</TabsTrigger>
          {canEditTariffs(role) && <TabsTrigger value="tariffs">Тарифы</TabsTrigger>}
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              {canEditCatalog(role) && (
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                    <Plus className="h-4 w-4" />
                    Добавить товар
                  </Button>
                </DialogTrigger>
              )}
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
            {canEditCatalog(role) && (
              <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}><FileSpreadsheet className="h-4 w-4" />Импорт Excel</Button>
            )}
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
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Поиск по названию, баркоду, артикулу"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              value={catalogSort}
              onValueChange={(v) => {
                setCatalogSort(v as typeof catalogSort);
                setCatalogSortDir("asc");
              }}
            >
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Сортировка: Название А-Я</SelectItem>
                <SelectItem value="barcode">Сортировка: Баркод</SelectItem>
                <SelectItem value="article">Сортировка: Артикул</SelectItem>
                <SelectItem value="stock">Сортировка: Остаток</SelectItem>
              </SelectContent>
            </Select>
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

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0 sm:p-2">
              <div className={EXCEL_TABLE_WRAP}>
                <table className={EXCEL_TABLE_BASE}>
                  <thead>
                    <tr>
                      <th className={`${EXCEL_STICKY_PHOTO_TH}`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>Фото</span>
                          <ExcelColumnFilterMenu
                            title="Фото (URL)"
                            searchValue={catalogColFilters.photo ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, photo: v }))}
                          />
                        </div>
                      </th>
                      <ExcelThWithFilter className={EXCEL_STICKY_NAME_TH} label="Товар">
                        <ExcelColumnFilterMenu
                          title="Товар"
                          searchValue={catalogColFilters.name ?? ""}
                          onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, name: v }))}
                          onSortAscText={() => {
                            setCatalogSort("name");
                            setCatalogSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setCatalogSort("name");
                            setCatalogSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <th className={`${STATIC_HEADER_BASE} min-w-[120px] whitespace-nowrap font-mono`}>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Артикул</span>
                          <ExcelColumnFilterMenu
                            title="Артикул"
                            searchValue={catalogColFilters.article ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, article: v }))}
                            onSortAscText={() => {
                              setCatalogSort("article");
                              setCatalogSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setCatalogSort("article");
                              setCatalogSortDir("desc");
                            }}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[140px] whitespace-nowrap font-mono`}>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Баркод</span>
                          <ExcelColumnFilterMenu
                            title="Баркод"
                            searchValue={catalogColFilters.barcode ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, barcode: v }))}
                            onSortAscText={() => {
                              setCatalogSort("barcode");
                              setCatalogSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setCatalogSort("barcode");
                              setCatalogSortDir("desc");
                            }}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[88px] whitespace-nowrap text-center`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>Цвет</span>
                          <ExcelColumnFilterMenu
                            title="Цвет"
                            searchValue={catalogColFilters.color ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, color: v }))}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} w-[64px] whitespace-nowrap text-center`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>Размер</span>
                          <ExcelColumnFilterMenu
                            title="Размер"
                            searchValue={catalogColFilters.size ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, size: v }))}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[100px] whitespace-nowrap`}>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Страна</span>
                          <ExcelColumnFilterMenu
                            title="Страна"
                            searchValue={catalogColFilters.country ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, country: v }))}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[140px] whitespace-nowrap`}>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Состав</span>
                          <ExcelColumnFilterMenu
                            title="Состав"
                            searchValue={catalogColFilters.composition ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, composition: v }))}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} w-[72px] text-right tabular-nums`}>
                        <div className="flex items-center justify-end gap-0.5">
                          <span>Остаток</span>
                          <ExcelColumnFilterMenu
                            title="Остаток"
                            searchValue={catalogColFilters.stock ?? ""}
                            onSearchChange={(v) => setCatalogColFilters((s) => ({ ...s, stock: v }))}
                            onSortAscNum={() => {
                              setCatalogSort("stock");
                              setCatalogSortDir("asc");
                            }}
                            onSortDescNum={() => {
                              setCatalogSort("stock");
                              setCatalogSortDir("desc");
                            }}
                          />
                        </div>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[108px] text-center`}>
                        <span>L×W×H / кг</span>
                      </th>
                      <th className={`${STATIC_HEADER_BASE} w-[96px] text-right`}>
                        <span>Действие</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogRows.map((item, idx) => {
                      const draft = rowDrafts[item.id];
                      const dirty = isDirty(item, draft);
                      const isEditing = Boolean(catalogEditingRows[item.id]);
                      const rowBg = excelRowBg(idx, false);
                      const cell = `border-b border-r border-slate-200 px-1.5 py-0.5 align-middle text-[11px] ${rowBg}`;
                      return (
                        <tr key={item.id}>
                          <td className={`${EXCEL_STICKY_PHOTO_TD} ${rowBg} text-center`}>
                            {item.photoUrl ? (
                              <button
                                type="button"
                                className="mx-auto block rounded border border-transparent p-0 hover:border-slate-400 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400"
                                onClick={() => setCatalogPhotoViewer(item.photoUrl)}
                                aria-label="Открыть фото"
                              >
                                <img src={item.photoUrl} alt="" className="mx-auto h-7 w-7 rounded border object-cover" />
                              </button>
                            ) : (
                              <div className="mx-auto h-7 w-7 rounded border border-dashed bg-slate-100" />
                            )}
                          </td>
                          <td className={`${EXCEL_STICKY_NAME_TD} ${rowBg} align-top`}>
                            <div className="space-y-0.5">
                              <button
                                type="button"
                                className="block max-w-full whitespace-nowrap text-left font-medium hover:underline"
                                onClick={() => openPrintDialog(item)}
                              >
                                {item.name}
                              </button>
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="h-6 w-full min-w-0 text-[11px]"
                                value={draft?.name ?? ""}
                                onChange={(e) =>
                                  setRowDrafts((s) => ({
                                    ...s,
                                    [item.id]: { ...(s[item.id] ?? rowToDraft(item)), name: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          </td>
                          <td className={`${cell} whitespace-nowrap font-mono`}>{item.supplierArticle || "—"}</td>
                          <td className={`${cell} whitespace-nowrap font-mono`}>
                            <button type="button" className="hover:underline" onClick={() => openPrintDialog(item)}>
                              {item.barcode}
                            </button>
                          </td>
                          <td className={`${cell} min-w-[88px] align-top`}>
                            <Input
                              disabled={!canEditCatalog(role) || !isEditing}
                              className="h-6 min-h-6 w-full text-[11px] leading-tight"
                              value={draft?.color ?? ""}
                              onChange={(e) =>
                                setRowDrafts((s) => ({
                                  ...s,
                                  [item.id]: { ...(s[item.id] ?? rowToDraft(item)), color: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className={`${cell} w-[64px] text-center align-top`}>
                            <Input
                              disabled={!canEditCatalog(role) || !isEditing}
                              className="mx-auto h-6 w-full min-w-0 text-center text-[11px]"
                              value={draft?.size ?? ""}
                              onChange={(e) =>
                                setRowDrafts((s) => ({
                                  ...s,
                                  [item.id]: { ...(s[item.id] ?? rowToDraft(item)), size: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className={`${cell} min-w-[100px] align-top`}>
                            <Input
                              disabled={!canEditCatalog(role) || !isEditing}
                              className="h-6 min-h-6 w-full text-[11px] leading-tight"
                              value={draft?.countryOfOrigin ?? ""}
                              onChange={(e) =>
                                setRowDrafts((s) => ({
                                  ...s,
                                  [item.id]: { ...(s[item.id] ?? rowToDraft(item)), countryOfOrigin: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className={`${cell} min-w-[140px] max-w-[220px] align-top`}>
                            <Input
                              disabled={!canEditCatalog(role) || !isEditing}
                              className="h-6 min-h-6 w-full text-[11px] leading-snug"
                              value={draft?.composition ?? ""}
                              onChange={(e) =>
                                setRowDrafts((s) => ({
                                  ...s,
                                  [item.id]: { ...(s[item.id] ?? rowToDraft(item)), composition: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className={`${cell} text-right tabular-nums font-medium`}>
                            <button type="button" className="hover:underline" onClick={() => setHistoryProductId(item.id)}>
                              {item.stockOnHand}
                            </button>
                          </td>
                          <td className={`${cell} align-top`}>
                            <p className="mb-0.5 line-clamp-2 text-[10px] leading-tight text-slate-600">{paramsLabel(item)}</p>
                            <div className="grid grid-cols-4 gap-0.5">
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="h-6 px-0.5 text-[10px]"
                                placeholder="L"
                                value={draft?.lengthCm ?? ""}
                                onChange={(e) =>
                                  setRowDrafts((s) => ({
                                    ...s,
                                    [item.id]: { ...(s[item.id] ?? rowToDraft(item)), lengthCm: e.target.value },
                                  }))
                                }
                              />
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="h-6 px-0.5 text-[10px]"
                                placeholder="W"
                                value={draft?.widthCm ?? ""}
                                onChange={(e) =>
                                  setRowDrafts((s) => ({
                                    ...s,
                                    [item.id]: { ...(s[item.id] ?? rowToDraft(item)), widthCm: e.target.value },
                                  }))
                                }
                              />
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="h-6 px-0.5 text-[10px]"
                                placeholder="H"
                                value={draft?.heightCm ?? ""}
                                onChange={(e) =>
                                  setRowDrafts((s) => ({
                                    ...s,
                                    [item.id]: { ...(s[item.id] ?? rowToDraft(item)), heightCm: e.target.value },
                                  }))
                                }
                              />
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="h-6 px-0.5 text-[10px]"
                                placeholder="кг"
                                type="number"
                                step="0.01"
                                value={draft?.weightKg ?? ""}
                                onChange={(e) =>
                                  setRowDrafts((s) => ({
                                    ...s,
                                    [item.id]: { ...(s[item.id] ?? rowToDraft(item)), weightKg: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            <Label className="mt-0.5 inline-flex cursor-pointer items-center gap-0.5 rounded border border-slate-200 bg-white px-0.5 py-0.5 text-[10px]">
                              <Upload className="h-3 w-3" />
                              Фото
                              <Input
                                disabled={!canEditCatalog(role) || !isEditing}
                                className="hidden"
                                type="file"
                                accept="image/*"
                                onChange={(e) => e.target.files?.[0] && void onUploadPhoto(item.id, e.target.files[0])}
                              />
                            </Label>
                          </td>
                          <td className={`${cell} text-right`}>
                            <Button
                              size="sm"
                              className={`h-7 px-2 text-[11px] ${isEditing && dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
                              disabled={!canEditCatalog(role) || isUpdatingProduct}
                              onClick={() => {
                                if (!isEditing) {
                                  setCatalogEditingRows((s) => ({ ...s, [item.id]: true }));
                                  return;
                                }
                                if (dirty) {
                                  void onRowAction(item).then(() => setCatalogEditingRows((s) => ({ ...s, [item.id]: false })));
                                  return;
                                }
                                setCatalogEditingRows((s) => ({ ...s, [item.id]: false }));
                              }}
                            >
                              {isEditing ? (dirty ? "Сохранить" : "Готово") : "Редактировать"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Dialog open={Boolean(catalogPhotoViewer)} onOpenChange={(o) => !o && setCatalogPhotoViewer(null)}>
            <DialogContent className="max-h-[90vh] max-w-[min(96vw,920px)] border-none bg-black/90 p-2 shadow-2xl sm:max-w-[min(96vw,920px)]">
              <DialogHeader className="sr-only">
                <DialogTitle>Просмотр фото</DialogTitle>
              </DialogHeader>
              {catalogPhotoViewer ? (
                <img
                  src={catalogPhotoViewer}
                  alt=""
                  className="mx-auto max-h-[85vh] w-auto max-w-full rounded object-contain"
                />
              ) : null}
            </DialogContent>
          </Dialog>

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
          <Dialog open={Boolean(historyProduct)} onOpenChange={(v) => !v && setHistoryProductId(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>История приходов</DialogTitle></DialogHeader>
              {historyProduct ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">Итого {historyProduct.stockOnHand} шт</p>
                  <div className="space-y-1">
                    {historyProduct.receiptHistory.length ? (
                      historyProduct.receiptHistory.map((h, idx) => (
                        <p key={`${h.documentNo}-${idx}`} className="text-sm">
                          {format(parseISO(h.dateIso), "dd.MM.yy", { locale: ru })} — {h.documentNo} — {h.quantity} шт
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Приходов пока нет</p>
                    )}
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="receiving">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-600">Задания на приёмку по клиенту</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2" onClick={downloadInboundTaskTemplate}>
                <Download className="h-4 w-4" />
                Скачать шаблон
              </Button>
              <Dialog
                open={inboundExcelOpen}
                onOpenChange={(next) => {
                  setInboundExcelOpen(next);
                  if (!next) setInboundExcelRows([]);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Импорт Excel
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Импорт заданий на приёмку</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setInboundExcelRows([]);
                        void parseExcelRows(f).then((raw) => setInboundExcelRows(parseInboundImportRows(raw)));
                      }}
                    />
                    <p className="text-xs text-slate-600">Строк к импорту: {inboundExcelRows.length}</p>
                    {inboundExcelRows.length > 0 && (
                      <div className="max-h-56 overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Артикул</TableHead>
                              <TableHead>Баркод</TableHead>
                              <TableHead>Цвет</TableHead>
                              <TableHead>Размер</TableHead>
                              <TableHead className="text-right">План</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inboundExcelRows.slice(0, 20).map((r, i) => (
                              <TableRow key={`${r.barcode}-${i}`}>
                                <TableCell>{r.supplierArticle || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{r.barcode || "—"}</TableCell>
                                <TableCell>{r.color || "—"}</TableCell>
                                <TableCell>{r.size || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.plannedQuantity}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInboundExcelOpen(false)}>Отмена</Button>
                    <Button onClick={() => void importInboundExcel()} disabled={!inboundExcelRows.length}>Импортировать</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {canCreateInbound(role) && (
                <Dialog open={createInboundOpen} onOpenChange={setCreateInboundOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                      <Plus className="h-4 w-4" />
                      Создать задание на приход
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Новое задание на приёмку</DialogTitle></DialogHeader>
                    <div className="grid gap-3 py-2">
                      <div className="grid gap-1.5">
                        <Label>Поиск товара (название/баркод)</Label>
                        <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Введите название или баркод" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Товар</Label>
                        <Select value={selectedInboundProductId} onValueChange={setSelectedInboundProductId}>
                          <SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger>
                          <SelectContent>
                            {filteredProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} · {p.barcode}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5"><Label>Количество</Label><Input type="number" min={1} value={inboundDraft.quantity} onChange={(e) => setInboundDraft((s) => ({ ...s, quantity: e.target.value }))} /></div>
                      <div className="grid gap-1.5"><Label>Маркетплейс</Label><Select value={inboundDraft.marketplace} onValueChange={(v) => setInboundDraft((s) => ({ ...s, marketplace: v as "wb" | "ozon" | "yandex" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wb">WB</SelectItem><SelectItem value="ozon">Ozon</SelectItem><SelectItem value="yandex">Яндекс</SelectItem></SelectContent></Select></div>
                      <div className="grid gap-1.5"><Label>Склад</Label><Input value={inboundDraft.warehouse} onChange={(e) => setInboundDraft((s) => ({ ...s, warehouse: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateInboundOpen(false)}>Отмена</Button>
                      <Button onClick={() => void onCreateInbound()} disabled={isCreating}>{isCreating ? "Сохранение..." : "Сохранить"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant={showOnlyDiff ? "default" : "outline"} size="sm" onClick={() => setShowOnlyDiff((v) => !v)}>
              {showOnlyDiff ? "Показать все" : "Только расхождения"}
            </Button>
            {canChangeInboundStatus(role) &&
              (!inboundMatrixEdit ? (
                <Button variant="secondary" size="sm" onClick={() => setInboundMatrixEdit(true)}>
                  Редактировать
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => void handleSaveAllInboundDrafts()} disabled={isUpdatingInbound}>
                    {isUpdatingInbound ? "Сохранение..." : "Сохранить всё"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => cancelInboundMatrixEdit()} disabled={isUpdatingInbound}>
                    Отмена
                  </Button>
                </>
              ))}
          </div>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0 sm:p-2">
              <div className={EXCEL_TABLE_WRAP}>
                <table className={EXCEL_TABLE_BASE}>
                  <thead>
                    <tr>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[160px] whitespace-nowrap`} label="Название">
                        <ExcelColumnFilterMenu
                          title="Название"
                          searchValue={recvColFilters.name ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, name: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("name");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("name");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[132px] whitespace-nowrap`} label="Артикул">
                        <ExcelColumnFilterMenu
                          title="Артикул"
                          searchValue={recvColFilters.article ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, article: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("article");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("article");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[150px] whitespace-nowrap font-mono`} label="Баркод">
                        <ExcelColumnFilterMenu
                          title="Баркод"
                          searchValue={recvColFilters.barcode ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, barcode: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("barcode");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("barcode");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[72px] whitespace-nowrap text-center`} label="Цвет">
                        <ExcelColumnFilterMenu
                          title="Цвет"
                          searchValue={recvColFilters.color ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, color: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("color");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("color");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[56px] whitespace-nowrap text-center`} label="Размер">
                        <ExcelColumnFilterMenu
                          title="Размер"
                          searchValue={recvColFilters.size ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, size: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("size");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("size");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[64px] whitespace-nowrap text-center`} label="МП">
                        <ExcelColumnFilterMenu
                          title="МП"
                          searchValue={recvColFilters.mp ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, mp: v }))}
                          onSortAscText={() => {
                            setRecvSortKey("mp");
                            setRecvSortDir("asc");
                          }}
                          onSortDescText={() => {
                            setRecvSortKey("mp");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} w-[72px] text-center tabular-nums`} label="План всего">
                        <ExcelColumnFilterMenu
                          title="План всего"
                          searchValue={recvColFilters.plan ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, plan: v }))}
                          onSortAscNum={() => {
                            setRecvSortKey("plan");
                            setRecvSortDir("asc");
                          }}
                          onSortDescNum={() => {
                            setRecvSortKey("plan");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      <ExcelThWithFilter className={`${STATIC_HEADER_BASE} w-[72px] text-center tabular-nums`} label="Факт всего">
                        <ExcelColumnFilterMenu
                          title="Факт всего"
                          searchValue={recvColFilters.fact ?? ""}
                          onSearchChange={(v) => setRecvColFilters((s) => ({ ...s, fact: v }))}
                          onSortAscNum={() => {
                            setRecvSortKey("fact");
                            setRecvSortDir("asc");
                          }}
                          onSortDescNum={() => {
                            setRecvSortKey("fact");
                            setRecvSortDir("desc");
                          }}
                        />
                      </ExcelThWithFilter>
                      {receivingMatrix.warehouses.map((wh, wi) => (
                        <th
                          key={wh}
                          className={`${WAREHOUSE_HEADER_CLASSES[wi % WAREHOUSE_HEADER_CLASSES.length]} border-r border-slate-300 px-1.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap min-w-[96px]`}
                        >
                          {wh}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {receivingMatrix.lines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8 + receivingMatrix.warehouses.length}
                          className="border-b border-slate-200 px-3 py-8 text-center text-muted-foreground text-[11px]"
                        >
                          Нет строк приёмки для отображения
                        </td>
                      </tr>
                    ) : (
                      receivingMatrix.lines.map((line, idx) => {
                        const ld = inboundRowDrafts[line.leaderRowId];
                        let nRefs = 0;
                        line.byWarehouse.forEach((c) => {
                          nRefs += c.rowRefs.length;
                        });
                        const soleRef =
                          nRefs === 1
                            ? Array.from(line.byWarehouse.values()).flatMap((c) => c.rowRefs)[0] ?? null
                            : null;
                        const planMismatch = line.totalPlan !== line.totalFact;
                        const rowBg = excelRowBg(idx, false);
                        const cellBase = `border-b border-r border-slate-200 px-1.5 py-0.5 align-middle text-[11px] ${rowBg}`;
                        const diffCell = planMismatch ? "bg-red-50/90 ring-1 ring-inset ring-red-300/80" : "";
                        const mpLabel =
                          line.marketplace === "wb" ? "WB" : line.marketplace === "ozon" ? "Ozon" : "Яндекс";
                        return (
                          <tr key={line.key}>
                            <td className={`${cellBase} whitespace-nowrap`}>
                              <span className="block whitespace-nowrap">{(line.name || "").trim() || "—"}</span>
                            </td>
                            <td className={`${cellBase} whitespace-nowrap`}>
                              {inboundMatrixEdit ? (
                                <Input
                                  className="h-7 min-w-[120px] border-slate-300 bg-white px-1.5 text-[11px]"
                                  value={ld?.supplierArticle ?? ""}
                                  onChange={(e) => patchInboundMatrixLineDrafts(line, { supplierArticle: e.target.value })}
                                />
                              ) : (
                                <span className="block whitespace-nowrap">{(ld?.supplierArticle ?? line.supplierArticle) || "—"}</span>
                              )}
                            </td>
                            <td className={`${cellBase} whitespace-nowrap font-mono`}>
                              {inboundMatrixEdit ? (
                                <Input
                                  className="h-7 min-w-[130px] border-slate-300 bg-white px-1.5 text-[11px] font-mono"
                                  value={ld?.barcode ?? ""}
                                  onChange={(e) => patchInboundMatrixLineDrafts(line, { barcode: e.target.value })}
                                />
                              ) : (
                                <span className="block whitespace-nowrap">{(ld?.barcode ?? line.barcode) || "—"}</span>
                              )}
                            </td>
                            <td className={`${cellBase} whitespace-nowrap text-center`}>
                              {inboundMatrixEdit ? (
                                <Input
                                  className="mx-auto h-7 w-full min-w-[64px] border-slate-300 bg-white px-1 text-center text-[11px]"
                                  value={ld?.color ?? ""}
                                  onChange={(e) => patchInboundMatrixLineDrafts(line, { color: e.target.value })}
                                />
                              ) : (
                                <span>{(ld?.color ?? line.color) || "—"}</span>
                              )}
                            </td>
                            <td className={`${cellBase} whitespace-nowrap text-center`}>
                              {inboundMatrixEdit ? (
                                <Input
                                  className="mx-auto h-7 w-full min-w-[48px] border-slate-300 bg-white px-1 text-center text-[11px]"
                                  value={ld?.size ?? ""}
                                  onChange={(e) => patchInboundMatrixLineDrafts(line, { size: e.target.value })}
                                />
                              ) : (
                                <span>{(ld?.size ?? line.size) || "—"}</span>
                              )}
                            </td>
                            <td className={`${cellBase} text-center`}>
                              {inboundMatrixEdit ? (
                                <Select
                                  value={ld?.marketplace ?? line.marketplace}
                                  onValueChange={(v) =>
                                    patchInboundMatrixLineDrafts(line, { marketplace: v as "wb" | "ozon" | "yandex" })
                                  }
                                >
                                  <SelectTrigger className="mx-auto h-7 min-w-[72px] px-1 text-[11px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="wb">WB</SelectItem>
                                    <SelectItem value="ozon">Ozon</SelectItem>
                                    <SelectItem value="yandex">Яндекс</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                mpLabel
                              )}
                            </td>
                            <td className={`${cellBase} text-center tabular-nums font-medium ${diffCell}`}>
                              {inboundMatrixEdit && soleRef ? (
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto h-7 w-[72px] border-slate-300 bg-white px-1 text-center text-[11px] tabular-nums"
                                  value={String(effInboundPlanned(soleRef.inboundId, soleRef.rowIndex))}
                                  onChange={(e) => setInboundDraftPlanned(soleRef.rowId, e.target.value)}
                                />
                              ) : (
                                line.totalPlan
                              )}
                            </td>
                            <td className={`${cellBase} text-center tabular-nums ${diffCell}`}>
                              {inboundMatrixEdit && soleRef ? (
                                <Input
                                  type="number"
                                  min={0}
                                  className="mx-auto h-7 w-[72px] border-slate-300 bg-white px-1 text-center text-[11px] tabular-nums"
                                  value={String(effInboundFactual(soleRef.inboundId, soleRef.rowIndex))}
                                  onChange={(e) => setInboundDraftFactual(soleRef.rowId, e.target.value)}
                                />
                              ) : (
                                line.totalFact
                              )}
                            </td>
                            {receivingMatrix.warehouses.map((wh, wi) => {
                              const cell = line.byWarehouse.get(wh);
                              const whBg = WAREHOUSE_COLUMN_CELL_BGS[wi % WAREHOUSE_COLUMN_CELL_BGS.length];
                              const whCell = `${cellBase} text-center tabular-nums ${whBg}`;
                              if (!cell || cell.rowRefs.length === 0) {
                                return (
                                  <td key={wh} className={whCell}>
                                    —
                                  </td>
                                );
                              }
                              const sumP = cell.rowRefs.reduce((s, r) => s + effInboundPlanned(r.inboundId, r.rowIndex), 0);
                              const sumF = cell.rowRefs.reduce((s, r) => s + effInboundFactual(r.inboundId, r.rowIndex), 0);
                              return (
                                <td key={wh} className={whCell}>
                                  <div className="leading-tight">
                                    <div>П: {sumP}</div>
                                    <div className="text-muted-foreground">Ф: {sumF}</div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Dialog open={Boolean(qrBoxPayload)} onOpenChange={(v) => !v && setQrBoxPayload(null)}>
            <DialogContent className="sm:max-w-md">
              <style>{`@media print{ @page { size: 58mm 40mm; margin:0; } body *{ visibility:hidden !important;} #box-qr-label,#box-qr-label *{ visibility:visible !important;} #box-qr-label{ position:fixed; left:0; top:0; width:58mm; height:40mm; } }`}</style>
              <DialogHeader><DialogTitle>Печать QR этикетки 58x40</DialogTitle></DialogHeader>
              {qrBoxPayload ? (
                <div className="space-y-3">
                  <div id="box-qr-label" className="mx-auto flex h-[40mm] w-[58mm] flex-col items-center justify-center gap-2 border p-2">
                    <QRCodeSVG value={qrBoxPayload.barcode} size={120} />
                    <p className="text-xs font-medium">{qrBoxPayload.warehouse}</p>
                  </div>
                  <Button onClick={() => window.print()}>Печать</Button>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="shipping">
          {outboundDebugAll ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <strong>Отладка:</strong> в таблице показаны все отгрузки из хранилища (без фильтра по юрлицу). Уберите из URL параметр{" "}
              <code className="rounded bg-white px-1 py-0.5">outboundDebug=1</code>.
            </p>
          ) : null}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-600">Задания на отгрузку по клиенту</p>
            <div className="flex items-center gap-2">
              {outboundPersistStatus === "durable" && (
                <span className="text-xs font-medium text-emerald-600">✓ Сохранено (локальная БД + IndexedDB)</span>
              )}
              {outboundPersistStatus === "durable_warn" && (
                <span className="text-xs font-medium text-amber-600">Сохранено локально; Supabase не синхронизирован</span>
              )}
              {outboundPersistStatus === "fail" && (
                <span className="text-xs font-medium text-red-600">Ошибка записи в локальное хранилище</span>
              )}
              <Button variant="outline" className="gap-2" onClick={downloadOutboundTaskTemplate}>
                <Download className="h-4 w-4" />
                Скачать шаблон
              </Button>
              <Dialog
                open={outboundExcelOpen}
                onOpenChange={(next) => {
                  setOutboundExcelOpen(next);
                  if (!next) setOutboundExcelRows([]);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Импорт Excel
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Импорт заданий на отгрузку</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setOutboundExcelRows([]);
                        void parseExcelRows(f).then((raw) => setOutboundExcelRows(parseOutboundImportRows(raw)));
                      }}
                    />
                    <p className="text-xs text-slate-600">Строк к импорту: {outboundExcelRows.length}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOutboundExcelOpen(false)}>Отмена</Button>
                    <Button onClick={() => void importOutboundExcel()} disabled={!outboundExcelRows.length}>Импортировать</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {canCreateOutbound(role) && (
                <Dialog open={createOutboundOpen} onOpenChange={setCreateOutboundOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                      <Plus className="h-4 w-4" />
                      Создать задание на отгрузку
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Новое задание на отгрузку</DialogTitle></DialogHeader>
                    <div className="grid gap-3 py-2">
                      <div className="grid gap-1.5">
                        <Label>Поиск товара (название/баркод)</Label>
                        <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Введите название или баркод" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Товар</Label>
                        <Select value={selectedOutboundProductId} onValueChange={setSelectedOutboundProductId}>
                          <SelectTrigger><SelectValue placeholder="Выберите товар из остатков" /></SelectTrigger>
                          <SelectContent>
                            {filteredProducts.filter((p) => p.stockOnHand > 0).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} · {p.barcode} · остаток {p.stockOnHand}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5"><Label>Количество</Label><Input type="number" min={1} value={outboundDraft.quantity} onChange={(e) => setOutboundDraft((s) => ({ ...s, quantity: e.target.value }))} /></div>
                      <div className="grid gap-1.5"><Label>Маркетплейс</Label><Select value={outboundDraft.marketplace} onValueChange={(v) => setOutboundDraft((s) => ({ ...s, marketplace: v as "wb" | "ozon" | "yandex" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wb">WB</SelectItem><SelectItem value="ozon">Ozon</SelectItem><SelectItem value="yandex">Яндекс</SelectItem></SelectContent></Select></div>
                      <div className="grid gap-1.5"><Label>Склад</Label><Input value={outboundDraft.warehouse} onChange={(e) => setOutboundDraft((s) => ({ ...s, warehouse: e.target.value }))} /></div>
                      <div className="grid gap-1.5"><Label>Способ отгрузки</Label><Select value={outboundDraft.shippingMethod} onValueChange={(v) => setOutboundDraft((s) => ({ ...s, shippingMethod: v as "fbo" | "fbs" | "self" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fbo">FBO</SelectItem><SelectItem value="fbs">FBS</SelectItem><SelectItem value="self">Самовывоз</SelectItem></SelectContent></Select></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOutboundOpen(false)}>Отмена</Button>
                      <Button onClick={() => void onCreateOutbound()} disabled={isCreatingOutbound}>{isCreatingOutbound ? "Сохранение..." : "Сохранить"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Поиск по складу, артикулу, баркоду, цвету, размеру, площадке"
              value={shippingSearch}
              onChange={(e) => setShippingSearch(e.target.value)}
              className="max-w-lg"
            />
            <Select
              value={shippingSort}
              onValueChange={(v) => {
                setShippingSort(v as typeof shippingSort);
                setShipSortDir("asc");
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Сортировка: Название</SelectItem>
                <SelectItem value="article">Сортировка: Артикул</SelectItem>
                <SelectItem value="barcode">Сортировка: Баркод</SelectItem>
                <SelectItem value="size">Сортировка: Размер</SelectItem>
                <SelectItem value="color">Сортировка: Цвет</SelectItem>
                <SelectItem value="marketplace">Сортировка: Площадка</SelectItem>
                <SelectItem value="warehouse">Сортировка: Склад</SelectItem>
                <SelectItem value="plan">Сортировка: План</SelectItem>
                <SelectItem value="fact">Сортировка: Факт</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportPackingExcelFromBoxes}>
              Экспорт shk-excel
            </Button>
            {canChangeOutboundStatus(role) &&
              (!shippingMatrixEdit ? (
                <Button variant="secondary" onClick={() => setShippingMatrixEdit(true)}>
                  Редактировать
                </Button>
              ) : (
                <>
                  <Button onClick={() => void handleSaveAllShippingDrafts()} disabled={isUpdatingOutbound}>
                    {isUpdatingOutbound ? "Сохранение..." : "Сохранить всё"}
                  </Button>
                  <Button variant="outline" onClick={() => cancelShippingMatrixEdit()} disabled={isUpdatingOutbound}>
                    Отмена
                  </Button>
                </>
              ))}
          </div>
          <div>
            <Card className="min-w-0 flex-1 border-slate-200 shadow-sm">
              <CardContent className="p-0 sm:p-2">
                <div className={EXCEL_TABLE_WRAP}>
                  <table className={EXCEL_TABLE_BASE}>
                    <thead>
                      <tr>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[200px] whitespace-nowrap`} label="Название">
                          <ExcelColumnFilterMenu
                            title="Название"
                            searchValue={shipColFilters.name ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, name: v }))}
                            onSortAscText={() => {
                              setShippingSort("name");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("name");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[140px] whitespace-nowrap`} label="Артикул">
                          <ExcelColumnFilterMenu
                            title="Артикул"
                            searchValue={shipColFilters.article ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, article: v }))}
                            onSortAscText={() => {
                              setShippingSort("article");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("article");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[160px] whitespace-nowrap font-mono`} label="Баркод">
                          <ExcelColumnFilterMenu
                            title="Баркод"
                            searchValue={shipColFilters.barcode ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, barcode: v }))}
                            onSortAscText={() => {
                              setShippingSort("barcode");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("barcode");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[72px] whitespace-nowrap`} label="Цвет">
                          <ExcelColumnFilterMenu
                            title="Цвет"
                            searchValue={shipColFilters.color ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, color: v }))}
                            onSortAscText={() => {
                              setShippingSort("color");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("color");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[56px] whitespace-nowrap`} label="Размер">
                          <ExcelColumnFilterMenu
                            title="Размер"
                            searchValue={shipColFilters.size ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, size: v }))}
                            onSortAscText={() => {
                              setShippingSort("size");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("size");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} min-w-[64px] whitespace-nowrap`} label="МП">
                          <ExcelColumnFilterMenu
                            title="МП"
                            searchValue={shipColFilters.mp ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, mp: v }))}
                            onSortAscText={() => {
                              setShippingSort("marketplace");
                              setShipSortDir("asc");
                            }}
                            onSortDescText={() => {
                              setShippingSort("marketplace");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} w-[72px] text-center tabular-nums`} label="План всего">
                          <ExcelColumnFilterMenu
                            title="План всего"
                            searchValue={shipColFilters.plan ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, plan: v }))}
                            onSortAscNum={() => {
                              setShippingSort("plan");
                              setShipSortDir("asc");
                            }}
                            onSortDescNum={() => {
                              setShippingSort("plan");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        <ExcelThWithFilter className={`${STATIC_HEADER_BASE} w-[72px] text-center tabular-nums`} label="Факт всего">
                          <ExcelColumnFilterMenu
                            title="Факт всего"
                            searchValue={shipColFilters.fact ?? ""}
                            onSearchChange={(v) => setShipColFilters((s) => ({ ...s, fact: v }))}
                            onSortAscNum={() => {
                              setShippingSort("fact");
                              setShipSortDir("asc");
                            }}
                            onSortDescNum={() => {
                              setShippingSort("fact");
                              setShipSortDir("desc");
                            }}
                          />
                        </ExcelThWithFilter>
                        {shippingMatrix.warehouses.map((wh, wi) => (
                          <th
                            key={wh}
                            className={`${WAREHOUSE_HEADER_CLASSES[wi % WAREHOUSE_HEADER_CLASSES.length]} border-r border-slate-300/60 px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[88px]`}
                          >
                            {wh}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shippingMatrix.lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8 + shippingMatrix.warehouses.length}
                            className="border-b border-slate-200 px-3 py-8 text-center text-muted-foreground"
                          >
                            Нет строк отгрузки для отображения
                          </td>
                        </tr>
                      ) : (
                        shippingMatrix.lines.map((line, idx) => {
                          const ld = outboundRowDrafts[line.leaderShipmentId];
                          let scanErr = false;
                          line.byWarehouse.forEach((c) => {
                            c.shipments.forEach((sh) => {
                              if (scanErrorByShipment[sh.id]) scanErr = true;
                            });
                          });
                          let totalPlanDraft = 0;
                          let totalFactDraft = 0;
                          line.byWarehouse.forEach((c) => {
                            c.shipments.forEach((sh) => {
                              totalPlanDraft += effOutboundPlanned(sh);
                              totalFactDraft += effOutboundFact(sh);
                            });
                          });
                          const planMismatch = totalPlanDraft !== totalFactDraft;
                          const rowBg = excelRowBg(idx, false);
                          const cellBase = `border-b border-r border-slate-200 px-2 py-1.5 align-middle text-[11px] ${rowBg}`;
                          const diffPlanFact = planMismatch ? "bg-red-50/90 ring-1 ring-inset ring-red-300/70" : "";
                          const scanHighlight = scanErr ? "bg-amber-50/80 ring-1 ring-inset ring-amber-400/70" : "";
                          const mpLabel =
                            line.marketplace === "wb" ? "WB" : line.marketplace === "ozon" ? "Ozon" : "Яндекс";
                          return (
                            <tr key={line.key}>
                              <td className={`${cellBase} whitespace-nowrap`}>
                                {shippingMatrixEdit ? (
                                  <Input
                                    className="h-7 min-w-[180px] border-slate-300 bg-white px-1.5 text-[11px]"
                                    value={ld?.productName ?? ""}
                                    onChange={(e) => patchOutboundMatrixLineDrafts(line, { productName: e.target.value })}
                                  />
                                ) : (
                                  <span className="block whitespace-nowrap">{(ld?.productName ?? line.name) || "—"}</span>
                                )}
                              </td>
                              <td className={`${cellBase} whitespace-nowrap`}>
                                {shippingMatrixEdit ? (
                                  <Input
                                    className="h-7 min-w-[120px] border-slate-300 bg-white px-1.5 text-[11px]"
                                    value={ld?.supplierArticle ?? ""}
                                    onChange={(e) => patchOutboundMatrixLineDrafts(line, { supplierArticle: e.target.value })}
                                  />
                                ) : (
                                  <span className="block whitespace-nowrap">{(ld?.supplierArticle ?? line.article) || "—"}</span>
                                )}
                              </td>
                              <td className={`${cellBase} whitespace-nowrap font-mono ${scanHighlight}`}>
                                {shippingMatrixEdit ? (
                                  <Input
                                    className="h-7 min-w-[140px] border-slate-300 bg-white px-1.5 text-[11px] font-mono"
                                    value={ld?.barcode ?? ""}
                                    onChange={(e) => patchOutboundMatrixLineDrafts(line, { barcode: e.target.value })}
                                  />
                                ) : (
                                  <span className="block whitespace-nowrap">{(ld?.barcode ?? line.barcode) || "—"}</span>
                                )}
                              </td>
                              <td className={`${cellBase} whitespace-nowrap text-center`}>
                                {shippingMatrixEdit ? (
                                  <Input
                                    className="h-7 w-full min-w-[64px] border-slate-300 bg-white px-1 text-[11px] text-center"
                                    value={ld?.color ?? ""}
                                    onChange={(e) => patchOutboundMatrixLineDrafts(line, { color: e.target.value })}
                                  />
                                ) : (
                                  <span>{(ld?.color ?? line.color) || "—"}</span>
                                )}
                              </td>
                              <td className={`${cellBase} whitespace-nowrap text-center`}>
                                {shippingMatrixEdit ? (
                                  <Input
                                    className="h-7 w-full min-w-[48px] border-slate-300 bg-white px-1 text-[11px] text-center"
                                    value={ld?.size ?? ""}
                                    onChange={(e) => patchOutboundMatrixLineDrafts(line, { size: e.target.value })}
                                  />
                                ) : (
                                  <span>{(ld?.size ?? line.size) || "—"}</span>
                                )}
                              </td>
                              <td className={`${cellBase} text-center`}>
                                {shippingMatrixEdit ? (
                                  <Select
                                    value={ld?.marketplace ?? line.marketplace}
                                    onValueChange={(v) =>
                                      patchOutboundMatrixLineDrafts(line, { marketplace: v as "wb" | "ozon" | "yandex" })
                                    }
                                  >
                                    <SelectTrigger className="h-7 min-w-[72px] px-1 text-[11px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="wb">WB</SelectItem>
                                      <SelectItem value="ozon">Ozon</SelectItem>
                                      <SelectItem value="yandex">Яндекс</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  mpLabel
                                )}
                              </td>
                              <td className={`${cellBase} text-center tabular-nums font-medium ${diffPlanFact}`}>{totalPlanDraft}</td>
                              <td className={`${cellBase} text-center tabular-nums ${diffPlanFact}`}>{totalFactDraft}</td>
                              {shippingMatrix.warehouses.map((wh) => {
                                const cell = line.byWarehouse.get(wh);
                                const whCell = `${cellBase} text-center tabular-nums`;
                                if (!cell || cell.shipments.length === 0) {
                                  return (
                                    <td key={wh} className={whCell}>
                                      —
                                    </td>
                                  );
                                }
                                const sumPlan = cell.shipments.reduce((s, sh) => s + effOutboundPlanned(sh), 0);
                                if (shippingMatrixEdit && cell.shipments.length === 1) {
                                  const sh = cell.shipments[0];
                                  return (
                                    <td key={wh} className={whCell}>
                                      <Input
                                        type="number"
                                        min={0}
                                        className="mx-auto h-7 w-[72px] border-slate-300 bg-white px-1 text-center text-[11px] tabular-nums"
                                        value={String(effOutboundPlanned(sh))}
                                        onChange={(e) => setShipmentDraftPlanned(sh.id, e.target.value)}
                                      />
                                    </td>
                                  );
                                }
                                return (
                                  <td key={wh} className={whCell}>
                                    {sumPlan}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="packer" className="space-y-3">
          <p className="text-sm text-slate-600">Сканирование и короба по отгрузкам клиента (отдельный модуль).</p>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="max-h-[min(78vh,820px)] space-y-3 overflow-y-auto p-3 text-[11px]">
              {shippingRows.map((row) => {
                const x = row.shipment;
                const boxes = x.boxes ?? [];
                const activeBox = boxes.find((b) => b.id === x.activeBoxId) ?? null;
                const packerFieldsEnabled = canChangeOutboundStatus(role);
                return (
                  <div key={`pack-${x.id}`} className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5">
                    <div className="mb-2 space-y-1">
                      <p className="whitespace-nowrap font-medium text-slate-800">
                        {row.article || "—"} · <span className="font-mono">{row.barcode || "—"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        План: {row.plan} · Упаковано: {x.packedUnits} · {x.sourceWarehouse}
                      </p>
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void onAddBox(x.id)}>
                        Добавить короб
                      </Button>
                      <Input
                        className="h-7 min-w-[140px] flex-1 font-mono text-[11px]"
                        placeholder={activeBox ? "Скан баркода" : "Сначала «Открыть» короб"}
                        disabled={!activeBox}
                        value={scanDraftByShipment[x.id] ?? ""}
                        onChange={(e) => setScanDraftByShipment((s) => ({ ...s, [x.id]: e.target.value }))}
                      />
                      <Button size="sm" className="h-7 text-[11px]" onClick={() => void onScanIntoActiveBox(x.id)}>
                        В короб
                      </Button>
                    </div>
                    {activeBox && <p className="mb-2 text-[10px] text-slate-500">Активный короб: {activeBox.id}</p>}
                    <div className="space-y-2">
                      {boxes.map((box) => (
                        <div key={box.id} className="grid gap-1.5 rounded border border-slate-200 bg-white p-2">
                          <Input
                            disabled={!packerFieldsEnabled}
                            className="h-7 text-[11px]"
                            placeholder="ШК короба (из ЛК)"
                            value={box.clientBoxBarcode}
                            onChange={(e) =>
                              void updateOutboundDraft({
                                id: x.id,
                                patch: {
                                  boxes: boxes.map((b) => (b.id === box.id ? { ...b, clientBoxBarcode: e.target.value } : b)),
                                },
                              })
                            }
                          />
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            <Input
                              disabled={!packerFieldsEnabled}
                              className="h-7 text-[11px]"
                              placeholder="Номер поставки"
                              value={x.supplyNumber}
                              onChange={(e) => void updateOutboundDraft({ id: x.id, patch: { supplyNumber: e.target.value } })}
                            />
                            <Input
                              disabled={!packerFieldsEnabled}
                              className="h-7 text-[11px]"
                              placeholder="ШК пропуска"
                              value={x.gateBarcode}
                              onChange={(e) => void updateOutboundDraft({ id: x.id, patch: { gateBarcode: e.target.value } })}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              onClick={() => void updateOutboundDraft({ id: x.id, patch: { activeBoxId: box.id } })}
                            >
                              Открыть
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              onClick={() => setQrBoxPayload({ barcode: box.clientBoxBarcode || box.id, warehouse: x.sourceWarehouse })}
                            >
                              QR
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0 sm:p-2">
              <div className={EXCEL_TABLE_WRAP}>
                <table className={EXCEL_TABLE_BASE}>
                  <thead>
                    <tr>
                      <th className={`${STATIC_HEADER_BASE} min-w-[132px] whitespace-nowrap`}>Дата</th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[100px] whitespace-nowrap`}>Сотрудник</th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[120px] whitespace-nowrap`}>Действие</th>
                      <th className={`${STATIC_HEADER_BASE} min-w-[200px]`}>Товар / документ</th>
                      <th className={`${STATIC_HEADER_BASE} w-[88px] text-right tabular-nums`}>Кол-во</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((ev, idx) => {
                      const rowBg = excelRowBg(idx, false);
                      const cell = `border-b border-r border-slate-200 px-1.5 py-0.5 align-middle text-[11px] ${rowBg}`;
                      return (
                        <tr key={ev.id}>
                          <td className={`${cell} whitespace-nowrap tabular-nums`}>
                            {format(parseISO(ev.dateIso), "d MMM yyyy HH:mm", { locale: ru })}
                          </td>
                          <td className={`${cell} whitespace-nowrap`}>{ev.actor}</td>
                          <td className={`${cell} whitespace-nowrap`}>{ev.action}</td>
                          <td className={`${cell} max-w-[320px] whitespace-nowrap`}>{ev.productLabel}</td>
                          <td className={`${cell} text-right tabular-nums font-medium`}>
                            {ev.quantity.toLocaleString("ru-RU")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
