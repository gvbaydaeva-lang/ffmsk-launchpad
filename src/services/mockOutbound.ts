import type { Marketplace, OutboundShipment } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMockOutboundShipments(): Promise<OutboundShipment[]> {
  await delay(120);
  return [
    {
      id: "out-1",
      legalEntityId: "le-2",
      productId: "prd-4",
      marketplace: "wb",
      sourceWarehouse: "Склад Коледино",
      shippingMethod: "fbo",
      plannedUnits: 300,
      shippedUnits: null,
      status: "создано",
      createdAt: "2026-04-23T09:10:00",
    },
    {
      id: "out-2",
      legalEntityId: "le-3",
      productId: "prd-2",
      marketplace: "ozon",
      sourceWarehouse: "Склад Химки",
      shippingMethod: "fbs",
      plannedUnits: 120,
      shippedUnits: 120,
      status: "отгружено",
      createdAt: "2026-04-22T13:40:00",
    },
  ];
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
