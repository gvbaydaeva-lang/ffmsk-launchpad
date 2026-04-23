import type { InboundSupply, Marketplace } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMockInboundSupplies(): Promise<InboundSupply[]> {
  await delay(130);
  return [
    {
      id: "in-1",
      legalEntityId: "le-2",
      documentNo: "ПТ-2026-0892",
      supplier: "ООО «Косметик Плюс»",
      items: [{ productId: "prd-4", quantity: 1200 }],
      marketplace: "wb",
      expectedUnits: 1200,
      receivedUnits: null,
      status: "ожидается",
      eta: "2026-04-24",
    },
    {
      id: "in-2",
      legalEntityId: "le-3",
      documentNo: "ПТ-2026-0881",
      supplier: "ИП Смирнов А.В.",
      items: [{ productId: "prd-2", quantity: 480 }],
      marketplace: "ozon",
      expectedUnits: 480,
      receivedUnits: 200,
      status: "частично",
      eta: "2026-04-22",
    },
    {
      id: "in-2b",
      legalEntityId: "le-1",
      documentNo: "ПТ-2026-0899",
      supplier: "ООО «Логистик Про»",
      items: [{ productId: "prd-6", quantity: 320 }],
      marketplace: "wb",
      expectedUnits: 320,
      receivedUnits: null,
      status: "в обработке",
      eta: "2026-04-23",
    },
    {
      id: "in-3",
      legalEntityId: "le-4",
      documentNo: "ПТ-2026-0855",
      supplier: "ООО «ГаджетСервис»",
      items: [{ productId: "prd-1", quantity: 640 }],
      marketplace: "yandex",
      expectedUnits: 640,
      receivedUnits: 640,
      status: "принято",
      eta: "2026-04-18",
    },
    {
      id: "in-4",
      legalEntityId: "le-5",
      documentNo: "ПТ-2026-0901",
      supplier: "ООО «Косметик Плюс»",
      items: [{ productId: "prd-3", quantity: 900 }],
      marketplace: "wb",
      expectedUnits: 900,
      receivedUnits: null,
      status: "ожидается",
      eta: "2026-04-25",
    },
  ];
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
