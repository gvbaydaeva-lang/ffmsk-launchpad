/** Маркетплейс: направление отгрузки / маршрут (не метрики продаж) */
export type Marketplace = "wb" | "ozon" | "yandex";

/** Строка остатков с партией (FIFO) */
export type StockFifoRow = {
  id: string;
  legalEntityId: string;
  sku: string;
  productName: string;
  batchCode: string;
  receivedAt: string;
  quantity: number;
  /** 1 = снимается первой при отгрузке */
  fifoRank: number;
  marketplace: Marketplace;
};

/** Услуги фулфилмента и взаиморасчёты с клиентами (не продажи товаров на МП) */
export type FfFinanceOperationKind =
  | "хранение"
  | "упаковка"
  | "логистика"
  | "начисление услуг"
  | "оплата от клиента";

/** Операция в журнале финансов FF */
export type FinanceOperation = {
  id: string;
  legalEntityId: string;
  date: string;
  kind: FfFinanceOperationKind;
  /** Направление отгрузки / тип маршрута; null — без привязки к МП */
  marketplace: Marketplace | null;
  amountRub: number;
  comment: string;
};

/** Метрики дашборда (B2B FF) */
export type DashboardMetrics = {
  inStorageUnits: number;
  inStorageSkuCount: number;
  assemblyQueueShipments: number;
  assemblyQueueUnits: number;
  shippedTotalCount: number;
  revenueServicesRub: number;
  revenueServicesOps: number;
  revenueStorageRub: number;
  revenueStorageClosedDays: number;
  revenueTotalRub: number;
};

export type StorageHistoryPoint = { date: string; valueRub: number };

export type RevenueByClientChartRow = {
  legalEntityId: string;
  shortName: string;
  servicesRub: number;
  storageRub: number;
};

export type StorageByClientTableRow = {
  legalEntityId: string;
  shortName: string;
  quantityUnits: number;
  tariffPerUnitRub: number;
  totalPerDayRub: number;
};

export type RecentWarehouseOperation = {
  id: string;
  date: string;
  kind: string;
  legalEntityId: string;
  detail: string;
};

export type DashboardBundle = {
  metrics: DashboardMetrics;
  storageHistory: StorageHistoryPoint[];
  revenueByClient: RevenueByClientChartRow[];
  storageByClient: StorageByClientTableRow[];
  recentOperations: RecentWarehouseOperation[];
};

/** Короб отгрузки */
export type ShipmentBox = {
  id: string;
  legalEntityId: string;
  marketplace: Marketplace;
  boxBarcode: string;
  itemsCount: number;
  weightKg: number;
  createdAt: string;
};

/** Входящая поставка (приёмка) */
export type InboundSupply = {
  id: string;
  legalEntityId: string;
  documentNo: string;
  supplier: string;
  marketplace: Marketplace;
  expectedUnits: number;
  receivedUnits: number | null;
  status: "ожидается" | "в обработке" | "частично" | "принято";
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
