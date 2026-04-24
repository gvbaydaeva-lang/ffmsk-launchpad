import type { Marketplace, OutboundShipment } from "@/types/domain";
import { hasSupabase, supabase } from "@/lib/supabaseClient";

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

type OutboundDbRow = {
  id: string;
  legal_entity_id: string;
  product_id: string;
  marketplace: Marketplace;
  source_warehouse: string;
  shipping_method: "fbo" | "fbs" | "self";
  box_barcode: string;
  gate_barcode: string;
  supply_number: string;
  expiry_date: string;
  packed_units: number;
  planned_units: number;
  planned_ship_date: string | null;
  shipped_units: number | null;
  status: OutboundShipment["status"];
  boxes: OutboundShipment["boxes"];
  active_box_id: string | null;
  created_at: string;
};

function toDb(row: OutboundShipment): OutboundDbRow {
  return {
    id: row.id,
    legal_entity_id: row.legalEntityId,
    product_id: row.productId,
    marketplace: row.marketplace,
    source_warehouse: row.sourceWarehouse,
    shipping_method: row.shippingMethod,
    box_barcode: row.boxBarcode,
    gate_barcode: row.gateBarcode,
    supply_number: row.supplyNumber,
    expiry_date: row.expiryDate,
    packed_units: row.packedUnits,
    planned_units: row.plannedUnits,
    planned_ship_date: row.plannedShipDate,
    shipped_units: row.shippedUnits,
    status: row.status,
    boxes: row.boxes ?? [],
    active_box_id: row.activeBoxId ?? null,
    created_at: row.createdAt,
  };
}

function fromDb(row: OutboundDbRow): OutboundShipment {
  return {
    id: row.id,
    legalEntityId: row.legal_entity_id,
    productId: row.product_id,
    marketplace: row.marketplace,
    sourceWarehouse: row.source_warehouse,
    shippingMethod: row.shipping_method,
    boxBarcode: row.box_barcode,
    gateBarcode: row.gate_barcode,
    supplyNumber: row.supply_number,
    expiryDate: row.expiry_date,
    packedUnits: row.packed_units,
    plannedUnits: row.planned_units,
    plannedShipDate: row.planned_ship_date,
    shippedUnits: row.shipped_units,
    status: row.status,
    boxes: row.boxes ?? [],
    activeBoxId: row.active_box_id,
    createdAt: row.created_at,
  };
}

export async function fetchMockOutboundShipments(): Promise<OutboundShipment[]> {
  await delay(120);
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("outbound_shipments").select("*").order("created_at", { ascending: false });
    if (!error && data) {
      const mapped = (data as OutboundDbRow[]).map(fromDb);
      writeOutboundStorage(mapped);
      return mapped;
    }
  }
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

export async function flushMockOutboundToDb(rows: OutboundShipment[]) {
  if (!hasSupabase || !supabase) return false;
  const payload = rows.map(toDb);
  const { error } = await supabase.from("outbound_shipments").upsert(payload, { onConflict: "id" });
  return !error;
}
