import type { FinanceOperation, Marketplace, ShipmentBox, StockFifoRow } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMockStockFifo(): Promise<StockFifoRow[]> {
  await delay(140);
  const bases: Omit<StockFifoRow, "id" | "fifoRank">[] = [
    {
      sku: "SKU-10042",
      productName: "Крем увлажняющий 50 мл",
      batchCode: "B-2026-041",
      receivedAt: "2026-04-02",
      quantity: 240,
      marketplace: "wb",
    },
    {
      sku: "SKU-10042",
      productName: "Крем увлажняющий 50 мл",
      batchCode: "B-2026-078",
      receivedAt: "2026-04-18",
      quantity: 180,
      marketplace: "wb",
    },
    {
      sku: "SKU-88401",
      productName: "Набор кистей 12 шт",
      batchCode: "B-2026-012",
      receivedAt: "2026-03-28",
      quantity: 96,
      marketplace: "ozon",
    },
    {
      sku: "SKU-22011",
      productName: "Чехол силикон прозрачный",
      batchCode: "B-2026-055",
      receivedAt: "2026-04-10",
      quantity: 520,
      marketplace: "yandex",
    },
    {
      sku: "SKU-22011",
      productName: "Чехол силикон прозрачный",
      batchCode: "B-2026-089",
      receivedAt: "2026-04-19",
      quantity: 310,
      marketplace: "yandex",
    },
  ];
  return bases.map((b, i) => ({
    ...b,
    id: `st-${i + 1}`,
    fifoRank: i + 1,
  }));
}

export async function fetchMockFinanceOperations(): Promise<FinanceOperation[]> {
  await delay(120);
  return [
    {
      id: "f-1",
      date: "2026-04-20",
      kind: "выплата",
      marketplace: "wb",
      amountRub: 184_200,
      comment: "Еженедельная выплата по реализации",
    },
    {
      id: "f-2",
      date: "2026-04-20",
      kind: "комиссия МП",
      marketplace: "wb",
      amountRub: -27_630,
      comment: "Комиссия WB ~15%",
    },
    {
      id: "f-3",
      date: "2026-04-19",
      kind: "логистика",
      marketplace: "ozon",
      amountRub: -4_120,
      comment: "FBO доставка на склад Ozon",
    },
    {
      id: "f-4",
      date: "2026-04-19",
      kind: "начисление",
      marketplace: "ozon",
      amountRub: 62_800,
      comment: "Продажи FBO за период",
    },
    {
      id: "f-5",
      date: "2026-04-18",
      kind: "комиссия МП",
      marketplace: "yandex",
      amountRub: -3_400,
      comment: "Комиссия Яндекс.Маркет",
    },
    {
      id: "f-6",
      date: "2026-04-18",
      kind: "выплата",
      marketplace: "yandex",
      amountRub: 28_950,
      comment: "Перевод на расчётный счёт",
    },
  ];
}

let boxSeq = 4;

export async function fetchMockShipmentBoxes(): Promise<ShipmentBox[]> {
  await delay(100);
  return [
    {
      id: "bx-1",
      marketplace: "wb",
      boxBarcode: "WBTR-7782910042",
      itemsCount: 42,
      weightKg: 8.4,
      createdAt: "2026-04-21T09:15:00",
    },
    {
      id: "bx-2",
      marketplace: "wb",
      boxBarcode: "WBTR-7782910043",
      itemsCount: 36,
      weightKg: 6.1,
      createdAt: "2026-04-21T09:18:00",
    },
    {
      id: "bx-3",
      marketplace: "ozon",
      boxBarcode: "OZ-BOX-992100887",
      itemsCount: 24,
      weightKg: 4.2,
      createdAt: "2026-04-21T10:02:00",
    },
  ];
}

export async function generateMockShipmentBoxes(
  marketplace: Marketplace,
  current: ShipmentBox[],
): Promise<ShipmentBox[]> {
  await delay(220);
  const n = ++boxSeq;
  const newBox: ShipmentBox = {
    id: `bx-gen-${n}`,
    marketplace,
    boxBarcode:
      marketplace === "wb"
        ? `WBTR-${8800000000 + n}`
        : marketplace === "ozon"
          ? `OZ-BOX-${990000000 + n}`
          : `YM-BOX-${770000000 + n}`,
    itemsCount: 18 + (n % 7) * 4,
    weightKg: Math.round((3.2 + (n % 5) * 0.8) * 10) / 10,
    createdAt: new Date().toISOString(),
  };
  return [newBox, ...current];
}
