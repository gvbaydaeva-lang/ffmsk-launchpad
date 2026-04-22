import type { WarehouseInventoryRow } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Начальные данные детального инвентаря (демо) */
export const WAREHOUSE_INVENTORY_SEED: WarehouseInventoryRow[] = [
  {
    id: "inv-1",
    productGroupId: "pg-bottle",
    legalEntityId: "le-4",
    brand: "SportAqua",
    productName: "Бутылка спорт.",
    color: "Синий",
    size: "M",
    sizeNote: "1 разм.",
    barcode: "2000000001001",
    cellCode: "A-12-03",
    quantity: 380,
    tariffPerUnitDayRub: 5.5,
    storagePerDayRub: 380 * 5.5,
    status: "на складе",
    marketplace: "wb",
  },
  {
    id: "inv-2",
    productGroupId: "pg-jeans",
    legalEntityId: "le-3",
    brand: "DenimCo",
    productName: "Джинсы прямые",
    color: "Синий",
    size: "32",
    sizeNote: "1 разм.",
    barcode: "2000000002002",
    cellCode: "B-04-11",
    quantity: 60,
    tariffPerUnitDayRub: 5,
    storagePerDayRub: 60 * 5,
    status: "на складе",
    marketplace: "ozon",
  },
  {
    id: "inv-3",
    productGroupId: "pg-diffuser",
    legalEntityId: "le-5",
    brand: "HomeScent",
    productName: "Диффузор",
    color: "Прозрачный",
    size: "—",
    sizeNote: "унив.",
    barcode: "2000000003003",
    cellCode: "C-01-07",
    quantity: 120,
    tariffPerUnitDayRub: 4,
    storagePerDayRub: 120 * 4,
    status: "на складе",
    marketplace: "yandex",
  },
  {
    id: "inv-4",
    productGroupId: "pg-cream",
    legalEntityId: "le-2",
    brand: "CareLab",
    productName: "Крем для лица",
    color: "Белый",
    size: "50 мл",
    sizeNote: "1 объём",
    barcode: "2000000004004",
    cellCode: "A-08-22",
    quantity: 410,
    tariffPerUnitDayRub: 6,
    storagePerDayRub: 410 * 6,
    status: "на складе",
    marketplace: "wb",
  },
  {
    id: "inv-5",
    productGroupId: "pg-cream",
    legalEntityId: "le-2",
    brand: "CareLab",
    productName: "Крем для лица",
    color: "Белый",
    size: "30 мл",
    sizeNote: "1 объём",
    barcode: "2000000004005",
    cellCode: "A-08-23",
    quantity: 140,
    tariffPerUnitDayRub: 6,
    storagePerDayRub: 140 * 6,
    status: "на складе",
    marketplace: "wb",
  },
  {
    id: "inv-6",
    productGroupId: "pg-demo",
    legalEntityId: "le-1",
    brand: "[DEMO]",
    productName: "Тестовый товар",
    color: "Чёрный",
    size: "L",
    sizeNote: "1 разм.",
    barcode: "2000000000000",
    cellCode: "Z-00-01",
    quantity: 25,
    tariffPerUnitDayRub: 5,
    storagePerDayRub: 25 * 5,
    status: "на складе",
    marketplace: "wb",
  },
];

export function cloneInventory(rows: WarehouseInventoryRow[]): WarehouseInventoryRow[] {
  return rows.map((r) => ({ ...r }));
}

/** SKU = уникальный вариант (баркод); единицы = сумма количеств */
export function aggregateByLegalEntity(rows: WarehouseInventoryRow[]) {
  const map: Record<string, { barcodes: Set<string>; units: number }> = {};
  for (const r of rows) {
    if (!map[r.legalEntityId]) map[r.legalEntityId] = { barcodes: new Set(), units: 0 };
    map[r.legalEntityId].barcodes.add(r.barcode);
    map[r.legalEntityId].units += r.quantity;
  }
  const out: Record<string, { warehouseSkuCount: number; warehouseUnitsTotal: number }> = {};
  for (const [id, v] of Object.entries(map)) {
    out[id] = { warehouseSkuCount: v.barcodes.size, warehouseUnitsTotal: v.units };
  }
  return out;
}

export function groupInventoryRows(rows: WarehouseInventoryRow[]) {
  const map = new Map<
    string,
    {
      productGroupId: string;
      legalEntityId: string;
      brand: string;
      productName: string;
      variants: WarehouseInventoryRow[];
    }
  >();
  for (const r of rows) {
    const key = `${r.productGroupId}:${r.legalEntityId}`;
    const cur = map.get(key);
    if (cur) cur.variants.push(r);
    else
      map.set(key, {
        productGroupId: r.productGroupId,
        legalEntityId: r.legalEntityId,
        brand: r.brand,
        productName: r.productName,
        variants: [r],
      });
  }
  return [...map.values()];
}

export async function fetchMockWarehouseInventory(): Promise<WarehouseInventoryRow[]> {
  await delay(100);
  return cloneInventory(WAREHOUSE_INVENTORY_SEED);
}
