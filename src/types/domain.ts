/** Маркетплейс для заказов, приёмки, отгрузок и аналитики */
export type Marketplace = "wb" | "ozon" | "yandex";

/** Период агрегации для линейного графика отгрузок */
export type ShipmentTrendPeriod = "week" | "month";

/** Точка временного ряда: объёмы отгрузок по площадкам */
export type ShipmentTrendPoint = {
  /** Подпись на оси X */
  label: string;
  wb: number;
  ozon: number;
  yandex: number;
};

/** Доля заказов по площадке (для круговой диаграммы) */
export type MarketplaceOrdersSlice = {
  marketplace: Marketplace;
  orders: number;
};

/** Строка остатков с партией (FIFO) */
export type StockFifoRow = {
  id: string;
  sku: string;
  productName: string;
  batchCode: string;
  receivedAt: string;
  quantity: number;
  /** 1 = снимается первой при отгрузке */
  fifoRank: number;
  marketplace: Marketplace;
};

/** Финансовая операция по площадке */
export type FinanceOperation = {
  id: string;
  date: string;
  kind: "начисление" | "комиссия МП" | "логистика" | "выплата";
  marketplace: Marketplace;
  amountRub: number;
  comment: string;
};

/** Короб отгрузки */
export type ShipmentBox = {
  id: string;
  marketplace: Marketplace;
  boxBarcode: string;
  itemsCount: number;
  weightKg: number;
  createdAt: string;
};

/** Входящая поставка (приёмка) */
export type InboundSupply = {
  id: string;
  documentNo: string;
  supplier: string;
  marketplace: Marketplace;
  expectedUnits: number;
  receivedUnits: number | null;
  status: "ожидается" | "частично" | "принято";
  eta: string;
};

/** Юридическое лицо */
export type LegalEntity = {
  id: string;
  shortName: string;
  fullName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  isActive: boolean;
};

/** Пользователь организации */
export type OrgUser = {
  id: string;
  email: string;
  displayName: string;
  role: "Администратор" | "Склад" | "Финансы" | "Только чтение";
  legalEntityId: string;
};

/** Сводка остатков по маркетплейсу (для аналитики склада) */
export type StockMarketplaceSummary = {
  marketplace: Marketplace;
  skuCount: number;
  batchCount: number;
  totalUnits: number;
};
