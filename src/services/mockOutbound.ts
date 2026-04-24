import type { Marketplace, OutboundShipment } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const OUTBOUND_STORAGE_KEY = "ffmsk.mock.outbound";

function readOutboundStorage(): OutboundShipment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTBOUND_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboundShipment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutboundStorage(rows: OutboundShipment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OUTBOUND_STORAGE_KEY, JSON.stringify(rows));
}

export async function fetchMockOutboundShipments(): Promise<OutboundShipment[]> {
  await delay(120);
  return readOutboundStorage();
}

export function appendMockOutbound(
  current: OutboundShipment[],
  draft: Omit<OutboundShipment, "id" | "createdAt">,
): OutboundShipment[] {
  const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = [{ ...draft, id, createdAt: new Date().toISOString() }, ...current];
  writeOutboundStorage(next);
  return next;
}

export function filterOutboundByMarketplace(rows: OutboundShipment[], mp: Marketplace | "all"): OutboundShipment[] {
  if (mp === "all") return rows;
  return rows.filter((r) => r.marketplace === mp);
}

export function saveMockOutbound(rows: OutboundShipment[]) {
  writeOutboundStorage(rows);
}
