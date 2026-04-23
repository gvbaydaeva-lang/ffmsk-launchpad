import type { InboundSupply, Marketplace } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMockInboundSupplies(): Promise<InboundSupply[]> {
  await delay(130);
  return [];
}

export function filterInboundByMarketplace(rows: InboundSupply[], mp: Marketplace | "all"): InboundSupply[] {
  if (mp === "all") return rows;
  return rows.filter((r) => r.marketplace === mp);
}

export function appendMockInbound(
  current: InboundSupply[],
  draft: Omit<InboundSupply, "id">,
): InboundSupply[] {
  const id = `in-${Date.now()}`;
  return [{ ...draft, id }, ...current];
}
