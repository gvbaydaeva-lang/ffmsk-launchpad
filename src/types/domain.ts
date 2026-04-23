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
  items: InboundLineItem[];
  marketplace: Marketplace;
  expectedUnits: number;
  receivedUnits: number | null;
  status: "ожидается" | "в обработке" | "частично" | "принято";
  eta: string;
};

export type InboundLineItem = {
  productId: string;
  quantity: number;
};

/** Тарифы фулфилмента по клиенту (договорные ставки) */
export type FulfillmentTariffs = {
  /** Хранение, ₽ за единицу в сутки */
  storagePerUnitDayRub: number;
  /** Хранение, ₽ за м3 в сутки (модель by_volume) */
  storagePerM3DayRub: number;
  /** Хранение, ₽ за паллету в сутки (модель by_pallets) */
  storagePerPalletDayRub: number;
  /** Приёмка, ₽ за операцию */
  receivingPerOperationRub: number;
  /** Маркировка, ₽ за единицу */
  labelingPerUnitRub: number;
  /** Упаковка, ₽ за единицу */
  packagingPerUnitRub: number;
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
  tariffs: FulfillmentTariffs;
  storageModel: "by_volume" | "by_pallets";
  /** Уникальные SKU (группы товаров) на складе — из оперативного инвентаря */
  warehouseSkuCount: number;
  /** Суммарные единицы товара на складе */
  warehouseUnitsTotal: number;
};

/** Строка детального складского инвентаря (вариант: цвет / размер / баркод) */
export type WarehouseInventoryRow = {
  id: string;
  /** Группировка строк в UI «товар → варианты» */
  productGroupId: string;
  productId: string;
  legalEntityId: string;
  brand: string;
  productName: string;
  color: string;
  size: string;
  /** Подпись размера в UI, напр. «1 разм.» */
  sizeNote: string;
  barcode: string;
  cellCode: string;
  quantity: number;
  occupiedVolumeM3: number;
  occupiedPallets: number;
  /** Тариф хранения ₽/ед/сут (по договору клиента) */
  tariffPerUnitDayRub: number;
  /** Расчёт: quantity * tariffPerUnitDayRub */
  storagePerDayRub: number;
  status: "на складе" | "отобран" | "брак" | "зарезервирован";
  marketplace: Marketplace;
};

export type ProductCatalogItem = {
  id: string;
  legalEntityId: string;
  category: string;
  photoUrl: string | null;
  name: string;
  brand: string;
  supplierArticle: string;
  manufacturer: string;
  country: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  barcode: string;
  unitsPerPallet: number;
};

/** История операций склада и финансовых событий */
export type OperationHistoryEvent = {
  id: string;
  dateIso: string;
  legalEntityId: string;
  actor: string;
  action: "приёмка" | "отгрузка" | "сканирование" | "закрытие дня" | "начисление";
  productLabel: string;
  quantity: number;
  comment: string;
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
