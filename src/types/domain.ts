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
export type TaskWorkflowStatus = "pending" | "processing" | "completed";

/** Входящая поставка (приёмка) */
export type InboundSupply = {
  id: string;
  legalEntityId: string;
  documentNo: string;
  supplier: string;
  items: InboundLineItem[];
  destinationWarehouse: string;
  marketplace: Marketplace;
  expectedUnits: number;
  receivedUnits: number | null;
  status: "ожидается" | "на приёмке" | "принято";
  workflowStatus?: TaskWorkflowStatus;
  eta: string;
};

export type InboundLineItem = {
  productId?: string;
  barcode: string;
  supplierArticle: string;
  name: string;
  color: string;
  size: string;
  plannedQuantity: number;
  factualQuantity: number;
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
  color: string;
  size: string;
  supplierArticle: string;
  manufacturer: string;
  countryOfOrigin: string;
  composition: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  barcode: string;
  unitsPerPallet: number;
  stockOnHand: number;
  receiptHistory: Array<{
    dateIso: string;
    documentNo: string;
    quantity: number;
  }>;
};

export type OutboundShipment = {
  id: string;
  legalEntityId: string;
  productId: string;
  /** Один импорт Excel / пакет строк задания — для upsert по баркоду внутри пакета */
  assignmentId?: string | null;
  /** Человекочитаемый номер задания (сводка в «Отгрузке») */
  assignmentNo?: string | null;
  /** Подписи из Excel при импорте (если каталог временно не сопоставился) */
  importArticle?: string | null;
  importBarcode?: string | null;
  importName?: string | null;
  importSize?: string | null;
  importColor?: string | null;
  marketplace: Marketplace;
  sourceWarehouse: string;
  shippingMethod: "fbo" | "fbs" | "self";
  boxBarcode: string;
  gateBarcode: string;
  supplyNumber: string;
  expiryDate: string;
  packedUnits: number;
  plannedUnits: number;
  plannedShipDate: string | null;
  shippedUnits: number | null;
  status: "готов к отгрузке (резерв)" | "к отгрузке" | "отгружено";
  workflowStatus?: TaskWorkflowStatus;
  boxes?: Array<{
    id: string;
    clientBoxBarcode: string;
    scannedBarcodes: string[];
  }>;
  activeBoxId?: string | null;
  createdAt: string;
};

/** Движение товара (остаток = сумма qty по согласованным ключам) */
export type InventoryMovement = {
  id: string;
  type: "INBOUND" | "OUTBOUND";
  taskId: string;
  taskNumber: string;
  legalEntityId: string;
  legalEntityName: string;
  warehouseId?: string;
  warehouseName?: string;
  itemId?: string;
  name: string;
  sku?: string;
  article?: string;
  barcode: string;
  marketplace?: string;
  color?: string;
  size?: string;
  /** INBOUND: положительный; OUTBOUND: отрицательный */
  qty: number;
  createdAt: string;
  source: "receiving" | "packing" | "shipping";
};

/** Сводка остатка по нормализованному ключу (для таблиц и проверок) */
export type InventoryBalanceRow = {
  key: string;
  legalEntityId: string;
  legalEntityName: string;
  warehouseName: string;
  name: string;
  sku: string;
  article: string;
  barcode: string;
  marketplace: string;
  color: string;
  size: string;
  balanceQty: number;
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

/** Журнал операций WMS (приёмка, отгрузка, сборка, остатки) — в localStorage */
export type OperationLog = {
  id: string;
  type: string;
  taskId?: string;
  taskNumber?: string;
  legalEntityId: string;
  legalEntityName: string;
  description: string;
  createdAt: string;
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
