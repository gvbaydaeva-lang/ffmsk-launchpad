import { format } from "date-fns";
import { ru } from "date-fns/locale/ru";
import type { ShipmentTrendPeriod, ShipmentTrendPoint, MarketplaceOrdersSlice } from "@/types/domain";

/** Детерминированный PRNG для стабильных демо-данных при фиксированном seed */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrendPoints(period: ShipmentTrendPeriod): ShipmentTrendPoint[] {
  const count = period === "week" ? 7 : 30;
  const rand = mulberry32(period === "week" ? 9_871_234 : 42_424_242);
  const today = new Date();
  const points: ShipmentTrendPoint[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const phase = (count - 1 - i) / Math.max(1, count - 1);
    const wave = Math.sin(phase * Math.PI * 2) * 0.15 + 0.92;

    const wb = Math.round((1100 + rand() * 520 + (1 - phase) * 180) * wave);
    const ozon = Math.round((640 + rand() * 480 + Math.cos(phase * 5) * 90) * wave);
    const yandex = Math.round((280 + rand() * 260 + rand() * 120) * wave);

    const label =
      period === "week"
        ? format(d, "EEE d MMM", { locale: ru })
        : format(d, "d MMM", { locale: ru });

    points.push({ label, wb, ozon, yandex });
  }

  return points;
}

function buildOrdersShare(): MarketplaceOrdersSlice[] {
  const rand = mulberry32(77_707);
  const wb = Math.round(2800 + rand() * 900);
  const ozon = Math.round(1900 + rand() * 700);
  const yandex = Math.round(650 + rand() * 400);
  const slices: MarketplaceOrdersSlice[] = [
    { marketplace: "wb", orders: wb },
    { marketplace: "ozon", orders: ozon },
    { marketplace: "yandex", orders: yandex },
  ];
  return slices;
}

/**
 * Заглушка «бэкенда»: имитирует сеть и возвращает сгенерированные ряды по трём площадкам.
 */
export async function fetchMockShipmentTrend(period: ShipmentTrendPeriod): Promise<ShipmentTrendPoint[]> {
  await new Promise((r) => setTimeout(r, 160));
  return buildTrendPoints(period);
}

export async function fetchMockMarketplaceOrdersShare(): Promise<MarketplaceOrdersSlice[]> {
  await new Promise((r) => setTimeout(r, 120));
  return buildOrdersShare();
}
