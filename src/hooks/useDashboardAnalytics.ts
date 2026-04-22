import { useQuery } from "@tanstack/react-query";
import type { ShipmentTrendPeriod } from "@/types/domain";
import { fetchMockMarketplaceOrdersShare, fetchMockShipmentTrend } from "@/services/mockShipmentAnalytics";

export function useShipmentTrend(period: ShipmentTrendPeriod) {
  return useQuery({
    queryKey: ["analytics", "shipment-trend", period],
    queryFn: () => fetchMockShipmentTrend(period),
  });
}

export function useMarketplaceOrdersShare() {
  return useQuery({
    queryKey: ["analytics", "marketplace-orders-share"],
    queryFn: fetchMockMarketplaceOrdersShare,
  });
}
