import { format, eachDayOfInterval, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ru } from "date-fns/locale/ru";
import type {
  DashboardBundle,
  DashboardMetrics,
  RecentWarehouseOperation,
  RevenueByClientChartRow,
  StorageByClientTableRow,
  StorageHistoryPoint,
} from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type DashboardQuery = {
  dateFromIso: string;
  dateToIso: string;
  legalEntityId: string;
};

const LE = {
  demo: "le-1",
  beauty: "le-2",
  textile: "le-3",
  sport: "le-4",
  ip: "le-5",
} as const;

const fullMetrics: DashboardMetrics = {
  inStorageUnits: 3490,
  inStorageSkuCount: 30,
  assemblyQueueShipments: 0,
  assemblyQueueUnits: 0,
  shippedTotalCount: 0,
  revenueServicesRub: 58_170,
  revenueServicesOps: 13,
  revenueStorageRub: 141_210,
  revenueStorageClosedDays: 46,
  revenueTotalRub: 199_380,
};

const metricsByEntity: Record<string, DashboardMetrics> = {
  [LE.demo]: {
    inStorageUnits: 820,
    inStorageSkuCount: 8,
    assemblyQueueShipments: 0,
    assemblyQueueUnits: 0,
    shippedTotalCount: 0,
    revenueServicesRub: 12_400,
    revenueServicesOps: 4,
    revenueStorageRub: 28_900,
    revenueStorageClosedDays: 12,
    revenueTotalRub: 41_300,
  },
  [LE.beauty]: {
    inStorageUnits: 1550,
    inStorageSkuCount: 9,
    assemblyQueueShipments: 0,
    assemblyQueueUnits: 0,
    shippedTotalCount: 0,
    revenueServicesRub: 26_500,
    revenueServicesOps: 5,
    revenueStorageRub: 69_240,
    revenueStorageClosedDays: 18,
    revenueTotalRub: 95_740,
  },
  [LE.textile]: {
    inStorageUnits: 610,
    inStorageSkuCount: 6,
    assemblyQueueShipments: 0,
    assemblyQueueUnits: 0,
    shippedTotalCount: 0,
    revenueServicesRub: 9_200,
    revenueServicesOps: 2,
    revenueStorageRub: 22_100,
    revenueStorageClosedDays: 9,
    revenueTotalRub: 31_300,
  },
  [LE.sport]: {
    inStorageUnits: 910,
    inStorageSkuCount: 4,
    assemblyQueueShipments: 0,
    assemblyQueueUnits: 0,
    shippedTotalCount: 0,
    revenueServicesRub: 7_800,
    revenueServicesOps: 1,
    revenueStorageRub: 15_500,
    revenueStorageClosedDays: 5,
    revenueTotalRub: 23_300,
  },
  [LE.ip]: {
    inStorageUnits: 600,
    inStorageSkuCount: 3,
    assemblyQueueShipments: 0,
    assemblyQueueUnits: 0,
    shippedTotalCount: 0,
    revenueServicesRub: 2_270,
    revenueServicesOps: 1,
    revenueStorageRub: 5_470,
    revenueStorageClosedDays: 2,
    revenueTotalRub: 7_740,
  },
};

const fullStorageByClient: StorageByClientTableRow[] = [
  { legalEntityId: LE.beauty, shortName: 'ООО «БьютиМаркет»', quantityUnits: 1550, tariffPerUnitRub: 6, totalPerDayRub: 9300 },
  { legalEntityId: LE.sport, shortName: 'ООО «СпортЛайн»', quantityUnits: 910, tariffPerUnitRub: 5.5, totalPerDayRub: 5005 },
  { legalEntityId: LE.textile, shortName: 'ООО «ТекстильПро»', quantityUnits: 420, tariffPerUnitRub: 7, totalPerDayRub: 2940 },
  { legalEntityId: LE.demo, shortName: '[DEMO] ООО «Аврора»', quantityUnits: 310, tariffPerUnitRub: 5, totalPerDayRub: 1550 },
  { legalEntityId: LE.ip, shortName: "ИП Иванова А.С.", quantityUnits: 300, tariffPerUnitRub: 4.75, totalPerDayRub: 1425 },
];

const fullRevenueByClient: RevenueByClientChartRow[] = [
  { legalEntityId: LE.demo, shortName: "[DEMO] ООО «Аврора»", servicesRub: 3200, storageRub: 8800 },
  { legalEntityId: LE.beauty, shortName: "БьютиМаркет", servicesRub: 26_500, storageRub: 69_240 },
  { legalEntityId: LE.textile, shortName: "ТекстильПро", servicesRub: 6200, storageRub: 15_400 },
  { legalEntityId: LE.sport, shortName: "СпортЛайн", servicesRub: 5100, storageRub: 12_100 },
  { legalEntityId: LE.ip, shortName: "ИП Иванова А.С.", servicesRub: 1800, storageRub: 4200 },
];

function buildStorageHistory(from: Date, to: Date): StorageHistoryPoint[] {
  const days = eachDayOfInterval({ start: from, end: to });
  const base = [12_200, 14_800, 13_100, 15_400, 16_200, 17_900, 18_400, 19_020];
  return days.map((d, i) => ({
    date: format(d, "d MMM", { locale: ru }),
    valueRub: base[i % base.length] + (i % 3) * 400,
  }));
}

const fullRecent: RecentWarehouseOperation[] = [
  { id: "op-1", date: "2026-04-22T11:20:00", kind: "Упаковка", legalEntityId: LE.beauty, detail: "Короб WB-12 · 42 ед." },
  { id: "op-2", date: "2026-04-22T09:05:00", kind: "Приёмка", legalEntityId: LE.textile, detail: "ПТ-2026-0892" },
  { id: "op-3", date: "2026-04-21T16:40:00", kind: "Хранение", legalEntityId: LE.sport, detail: "Закрытие дня 20.04" },
  { id: "op-4", date: "2026-04-21T14:00:00", kind: "Маркировка", legalEntityId: LE.beauty, detail: "Партия B-2026-078" },
  { id: "op-5", date: "2026-04-21T10:30:00", kind: "Отгрузка", legalEntityId: LE.demo, detail: "Паллет на Коледино" },
];

function filterByEntity<T extends { legalEntityId: string }>(rows: T[], id: string): T[] {
  if (id === "all") return rows;
  return rows.filter((r) => r.legalEntityId === id);
}

export async function fetchDashboardBundle(q: DashboardQuery): Promise<DashboardBundle> {
  await delay(130);
  const from = startOfDay(parseISO(q.dateFromIso));
  const to = endOfDay(parseISO(q.dateToIso));

  const metrics = q.legalEntityId === "all" ? fullMetrics : metricsByEntity[q.legalEntityId] ?? fullMetrics;

  const storageByClient = filterByEntity(fullStorageByClient, q.legalEntityId);
  const revenueByClient = filterByEntity(fullRevenueByClient, q.legalEntityId);

  let storageHistory = buildStorageHistory(from, to);
  if (q.legalEntityId !== "all") {
    storageHistory = storageHistory.map((p) => ({
      ...p,
      valueRub: Math.round(p.valueRub * 0.35 + (q.legalEntityId.charCodeAt(2) % 5) * 800),
    }));
  }

  const recentFiltered = filterByEntity(fullRecent, q.legalEntityId).filter((op) =>
    isWithinInterval(parseISO(op.date), { start: from, end: to }),
  );

  return {
    metrics,
    storageHistory,
    revenueByClient,
    storageByClient,
    recentOperations: recentFiltered.length ? recentFiltered : filterByEntity(fullRecent, q.legalEntityId).slice(0, 3),
  };
}

export function sumStorageDay(rows: StorageByClientTableRow[]): number {
  return rows.reduce((s, r) => s + r.totalPerDayRub, 0);
}
