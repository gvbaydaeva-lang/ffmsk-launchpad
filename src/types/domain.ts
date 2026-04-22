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
