import type { ProductCatalogItem } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const PRODUCT_CATALOG_SEED: ProductCatalogItem[] = [
  {
    id: "prd-1",
    legalEntityId: "le-4",
    category: "Спорттовары",
    photoUrl: null,
    name: "Бутылка спорт.",
    brand: "SportAqua",
    color: "Прозрачный",
    size: "500 мл",
    supplierArticle: "SA-BTL-001",
    manufacturer: "SportAqua Factory",
    countryOfOrigin: "Россия",
    composition: "ПЭТ",
    lengthCm: 8,
    widthCm: 8,
    heightCm: 24,
    weightKg: 0.35,
    barcode: "2000000001001",
    unitsPerPallet: 300,
  },
  {
    id: "prd-2",
    legalEntityId: "le-3",
    category: "Одежда",
    photoUrl: null,
    name: "Джинсы прямые",
    brand: "DenimCo",
    color: "Синий",
    size: "M",
    supplierArticle: "DNM-JNS-032",
    manufacturer: "DenimCo",
    countryOfOrigin: "Турция",
    composition: "98% хлопок, 2% эластан",
    lengthCm: 32,
    widthCm: 28,
    heightCm: 4,
    weightKg: 0.65,
    barcode: "2000000002002",
    unitsPerPallet: 240,
  },
  {
    id: "prd-3",
    legalEntityId: "le-5",
    category: "Дом",
    photoUrl: null,
    name: "Диффузор",
    brand: "HomeScent",
    color: "Белый",
    size: "100 мл",
    supplierArticle: "HS-DF-100",
    manufacturer: "HomeScent",
    countryOfOrigin: "Китай",
    composition: "Стекло, ароматическая смесь",
    lengthCm: 8,
    widthCm: 8,
    heightCm: 25,
    weightKg: 0.5,
    barcode: "2000000003003",
    unitsPerPallet: 180,
  },
  {
    id: "prd-4",
    legalEntityId: "le-2",
    category: "Косметика",
    photoUrl: null,
    name: "Крем для лица 50 мл",
    brand: "CareLab",
    color: "Белый",
    size: "50 мл",
    supplierArticle: "CL-CRM-050",
    manufacturer: "CareLab",
    countryOfOrigin: "Россия",
    composition: "Косметическая основа",
    lengthCm: 5,
    widthCm: 5,
    heightCm: 13,
    weightKg: 0.12,
    barcode: "2000000004004",
    unitsPerPallet: 1200,
  },
  {
    id: "prd-5",
    legalEntityId: "le-2",
    category: "Косметика",
    photoUrl: null,
    name: "Крем для лица 30 мл",
    brand: "CareLab",
    color: "Белый",
    size: "30 мл",
    supplierArticle: "CL-CRM-030",
    manufacturer: "CareLab",
    countryOfOrigin: "Россия",
    composition: "Косметическая основа",
    lengthCm: 4,
    widthCm: 4,
    heightCm: 11,
    weightKg: 0.09,
    barcode: "2000000004005",
    unitsPerPallet: 1500,
  },
  {
    id: "prd-6",
    legalEntityId: "le-1",
    category: "Демо",
    photoUrl: null,
    name: "Тестовый товар",
    brand: "[DEMO]",
    color: "Черный",
    size: "L",
    supplierArticle: "DEMO-001",
    manufacturer: "Demo Factory",
    countryOfOrigin: "Россия",
    composition: "Демо-материал",
    lengthCm: 20,
    widthCm: 20,
    heightCm: 20,
    weightKg: 1,
    barcode: "2000000000000",
    unitsPerPallet: 64,
  },
];

export async function fetchMockProductCatalog(): Promise<ProductCatalogItem[]> {
  await delay(80);
  return PRODUCT_CATALOG_SEED.map((x) => ({ ...x }));
}

export function appendMockProductCatalogItem(
  current: ProductCatalogItem[],
  draft: Omit<ProductCatalogItem, "id" | "barcode"> & { barcode?: string },
): ProductCatalogItem[] {
  const id = `prd-${Date.now()}`;
  const generatedBarcode = draft.barcode?.trim() || `${Date.now()}`.slice(-13);
  return [{ ...draft, category: draft.category || "Без категории", id, barcode: generatedBarcode }, ...current];
}

export function updateMockProductCatalogItem(
  current: ProductCatalogItem[],
  id: string,
  patch: Partial<ProductCatalogItem>,
): ProductCatalogItem[] {
  return current.map((x) => (x.id === id ? { ...x, ...patch } : x));
}
