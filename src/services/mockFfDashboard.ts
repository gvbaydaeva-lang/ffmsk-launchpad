import type { FfDashboardSnapshot } from "@/types/domain";
import { fetchMockInboundSupplies } from "@/services/mockReceiving";
import { fetchMockLegalEntities } from "@/services/mockWms";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Операционный срез для владельца FF: приёмки, исходящая отгрузка, мощность, деньги услуг, клиенты.
 * Без заказов селлеров и выручки с МП.
 */
export async function fetchFfDashboardSnapshot(): Promise<FfDashboardSnapshot> {
  await delay(140);
  const inbound = await fetchMockInboundSupplies();
  const receivingsInProcessing = inbound.filter((r) => r.status === "в обработке" || r.status === "частично").length;

  const legals = await fetchMockLegalEntities();
  const activeLegalEntitiesCount = legals.filter((l) => l.isActive).length;

  return {
    receivingsInProcessing,
    boxesPendingShipmentToday: 14,
    palletsPendingShipmentToday: 3,
    rackOccupancyPercent: 76,
    clientsReceivablesRub: 1_240_000,
    servicesRevenueMonthRub: 3_180_000,
    activeLegalEntitiesCount,
  };
}
