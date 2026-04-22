import type { Marketplace } from "@/types/domain";

/** Цвета для графиков: WB — фиолетовый, Ozon — синий, Яндекс — жёлтый */
export const MARKETPLACE_CHART_COLORS: Record<Marketplace, string> = {
  wb: "#7c3aed",
  ozon: "#2563eb",
  yandex: "#eab308",
};

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  wb: "Wildberries",
  ozon: "Ozon",
  yandex: "Яндекс.Маркет",
};
