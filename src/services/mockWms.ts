import type {
  FinanceOperation,
  LegalEntity,
  Marketplace,
  OrgUser,
  ShipmentBox,
  StockFifoRow,
} from "@/types/domain";

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
      kind: "начисление услуг",
      marketplace: "wb",
      amountRub: 128_400,
      comment: "Хранение + обработка отгрузок на Коледино (апрель)",
    },
    {
      id: "f-2",
      date: "2026-04-20",
      kind: "оплата от клиента",
      marketplace: null,
      amountRub: 95_000,
      comment: "Поступление по счёту №184 от ООО «Ритейл Про»",
    },
    {
      id: "f-3",
      date: "2026-04-19",
      kind: "упаковка",
      marketplace: "ozon",
      amountRub: 18_200,
      comment: "Упаковочные материалы и сборка коробов FBO",
    },
    {
      id: "f-4",
      date: "2026-04-19",
      kind: "логистика",
      marketplace: "yandex",
      amountRub: 42_600,
      comment: "Доставка до сортировочного центра (услуга FF)",
    },
    {
      id: "f-5",
      date: "2026-04-18",
      kind: "хранение",
      marketplace: null,
      amountRub: 56_300,
      comment: "Абонемент на площадь стеллажей, неделя 16",
    },
    {
      id: "f-6",
      date: "2026-04-18",
      kind: "начисление услуг",
      marketplace: "wb",
      amountRub: 74_150,
      comment: "Маркировка и приёмка входящей поставки ПТ-2026-0881",
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

export async function fetchMockLegalEntities(): Promise<LegalEntity[]> {
  await delay(110);
  return [
    {
      id: "le-1",
      shortName: "ООО «Ритейл Про»",
      fullName: "Общество с ограниченной ответственностью «Ритейл Про»",
      inn: "7701234567",
      kpp: "770101001",
      ogrn: "1027700132195",
      isActive: true,
    },
    {
      id: "le-2",
      shortName: "ИП Байдаева Г.В.",
      fullName: "Индивидуальный предприниматель Байдаева Галина Викторовна",
      inn: "500123456789",
      kpp: "",
      ogrn: "320500100012345",
      isActive: true,
    },
  ];
}

export async function fetchMockOrgUsers(): Promise<OrgUser[]> {
  await delay(100);
  return [
    {
      id: "u-1",
      email: "admin@example.ru",
      displayName: "Администратор",
      role: "Администратор",
      legalEntityId: "le-1",
    },
    {
      id: "u-2",
      email: "sklad@example.ru",
      displayName: "Складской оператор",
      role: "Склад",
      legalEntityId: "le-1",
    },
    {
      id: "u-3",
      email: "finance@example.ru",
      displayName: "Бухгалтерия",
      role: "Финансы",
      legalEntityId: "le-2",
    },
  ];
}

export function appendMockLegalEntity(current: LegalEntity[], draft: Omit<LegalEntity, "id">): LegalEntity[] {
  const id = `le-${Date.now()}`;
  return [...current, { ...draft, id }];
}

export function appendMockOrgUser(current: OrgUser[], draft: Omit<OrgUser, "id">): OrgUser[] {
  const id = `u-${Date.now()}`;
  return [...current, { ...draft, id }];
}
