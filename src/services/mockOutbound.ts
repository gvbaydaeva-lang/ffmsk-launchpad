import type { Marketplace, OutboundShipment } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMockOutboundShipments(): Promise<OutboundShipment[]> {
  await delay(120);
  return [];
}

export function appendMockOutbound(
  current: OutboundShipment[],
  draft: Omit<OutboundShipment, "id" | "createdAt">,
): OutboundShipment[] {
  const id = `out-${Date.now()}`;
  return [{ ...draft, id, createdAt: new Date().toISOString() }, ...current];
}

export function filterOutboundByMarketplace(rows: OutboundShipment[], mp: Marketplace | "all"): OutboundShipment[] {
  if (mp === "all") return rows;
  return rows.filter((r) => r.marketplace === mp);
}
