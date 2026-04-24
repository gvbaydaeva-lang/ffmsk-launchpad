import type { InboundSupply, Marketplace } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const INBOUND_STORAGE_KEY = "ffmsk.mock.inbound";

function readInboundStorage(): InboundSupply[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INBOUND_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InboundSupply[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeInboundStorage(rows: InboundSupply[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOUND_STORAGE_KEY, JSON.stringify(rows));
}

export async function fetchMockInboundSupplies(): Promise<InboundSupply[]> {
  await delay(130);
  return readInboundStorage();
}

export function filterInboundByMarketplace(rows: InboundSupply[], mp: Marketplace | "all"): InboundSupply[] {
  if (mp === "all") return rows;
  return rows.filter((r) => r.marketplace === mp);
}

export function appendMockInbound(
  current: InboundSupply[],
  draft: Omit<InboundSupply, "id">,
): InboundSupply[] {
  const id = `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = [{ ...draft, id }, ...current];
  writeInboundStorage(next);
  return next;
}

export function saveMockInbound(rows: InboundSupply[]) {
  writeInboundStorage(rows);
}
