import type { Marketplace, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { hasSupabase, supabase } from "@/lib/supabaseClient";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const OUTBOUND_STORAGE_KEY = "ffmsk.mock.outbound";
const IDB_NAME = "ffmsk-wms";
const IDB_VERSION = 1;
const IDB_STORE = "outbound_shipments";

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

function openOutboundIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Браузерная «БД»: IndexedDB — переживает F5 и навигацию. */
export async function writeOutboundIndexed(rows: OutboundShipment[]): Promise<boolean> {
  const db = await openOutboundIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const row of rows) {
        store.put(JSON.parse(JSON.stringify(row)) as OutboundShipment);
      }
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function readOutboundIndexed(): Promise<OutboundShipment[] | null> {
  const db = await openOutboundIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const rows = req.result as OutboundShipment[];
        resolve(Array.isArray(rows) ? rows : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
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
  workflow_status?: OutboundShipment["workflowStatus"];
  boxes: OutboundShipment["boxes"];
  active_box_id: string | null;
  created_at: string;
  assignment_id?: string | null;
  assignment_no?: string | null;
  import_article?: string | null;
  import_barcode?: string | null;
  import_name?: string | null;
  import_size?: string | null;
  import_color?: string | null;
};

function normalizeBoxesFromDb(raw: unknown): OutboundShipment["boxes"] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as OutboundShipment["boxes"];
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as OutboundShipment["boxes"]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseOutboundPriority(raw: unknown): OutboundShipment["priority"] | undefined {
  if (raw === "high" || raw === "normal" || raw === "low") return raw;
  return undefined;
}

function parseOutboundWorkflowStatus(raw: unknown): TaskWorkflowStatus | undefined {
  if (
    raw === "pending" ||
    raw === "processing" ||
    raw === "completed" ||
    raw === "assembling" ||
    raw === "assembled" ||
    raw === "shipped"
  ) {
    return raw;
  }
  return undefined;
}

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
    workflow_status: row.workflowStatus ?? "pending",
    boxes: row.boxes ?? [],
    active_box_id: row.activeBoxId ?? null,
    created_at: row.createdAt,
    assignment_id: row.assignmentId ?? null,
    assignment_no: row.assignmentNo ?? null,
    import_article: row.importArticle ?? null,
    import_barcode: row.importBarcode ?? null,
    import_name: row.importName ?? null,
    import_size: row.importSize ?? null,
    import_color: row.importColor ?? null,
  };
}

function fromDb(row: OutboundDbRow & { legalEntityId?: string }): OutboundShipment {
  const legalEntityId = row.legal_entity_id ?? row.legalEntityId ?? "";
  return {
    id: row.id,
    legalEntityId,
    productId: row.product_id ?? (row as { productId?: string }).productId ?? "",
    marketplace: row.marketplace,
    sourceWarehouse: row.source_warehouse ?? (row as { sourceWarehouse?: string }).sourceWarehouse ?? "",
    shippingMethod: row.shipping_method ?? (row as { shippingMethod?: OutboundShipment["shippingMethod"] }).shippingMethod ?? "fbo",
    boxBarcode: row.box_barcode ?? "",
    gateBarcode: row.gate_barcode ?? "",
    supplyNumber: row.supply_number ?? "",
    expiryDate: row.expiry_date ?? "",
    packedUnits: row.packed_units ?? 0,
    plannedUnits: row.planned_units ?? 0,
    plannedShipDate: row.planned_ship_date ?? null,
    shippedUnits: row.shipped_units ?? null,
    status: row.status,
    workflowStatus:
      parseOutboundWorkflowStatus(row.workflow_status) ??
      (row.status === "отгружено" ? "completed" : "pending"),
    boxes: normalizeBoxesFromDb(row.boxes),
    activeBoxId: row.active_box_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    assignmentId: row.assignment_id ?? undefined,
    assignmentNo: row.assignment_no ?? undefined,
    importArticle: row.import_article ?? undefined,
    importBarcode: row.import_barcode ?? undefined,
    importName: row.import_name ?? undefined,
    importSize: row.import_size ?? undefined,
    importColor: row.import_color ?? undefined,
    priority: parseOutboundPriority(
      (row as { priority?: unknown }).priority ??
        (row as { packing_priority?: unknown }).packing_priority ??
        (row as { packingPriority?: unknown }).packingPriority,
    ),
  };
}

/** Колонки, которых может не быть в старой схеме Supabase */
function stripExtendedForLegacySupabase(row: OutboundDbRow): Omit<
  OutboundDbRow,
  | "assignment_id"
  | "assignment_no"
  | "import_article"
  | "import_barcode"
  | "import_name"
  | "import_size"
  | "import_color"
> {
  const {
    assignment_id: _a,
    assignment_no: _n,
    import_article: _ia,
    import_barcode: _ib,
    import_name: _in,
    import_size: _is,
    import_color: _ic,
    ...rest
  } = row;
  return rest;
}

export async function fetchMockOutboundShipments(): Promise<OutboundShipment[]> {
  await delay(120);
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("outbound_shipments").select("*").order("created_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      const mapped = (data as OutboundDbRow[]).map(fromDb);
      // Пустой ответ облака не затирает IndexedDB / LS: иначе при пустой таблице или RLS строки «пропадают» из UI.
      if (mapped.length > 0) {
        writeOutboundStorage(mapped);
        void writeOutboundIndexed(mapped);
        return mapped;
      }
    }
  }
  const fromIdb = await readOutboundIndexed();
  if (fromIdb && fromIdb.length) {
    writeOutboundStorage(fromIdb);
    return fromIdb;
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
  void writeOutboundIndexed(next);
  return next;
}

export function filterOutboundByMarketplace(rows: OutboundShipment[], mp: Marketplace | "all"): OutboundShipment[] {
  if (mp === "all") return rows;
  return rows.filter((r) => r.marketplace === mp);
}

export function saveMockOutbound(rows: OutboundShipment[]) {
  writeOutboundStorage(rows);
  void writeOutboundIndexed(rows);
}

/**
 * Гарантированная запись: localStorage + IndexedDB; при наличии конфига — upsert в Supabase.
 * Возвращает durable=true если локальный слой записан; supabaseOk — отдельно про облако.
 */
export async function persistOutboundDurably(rows: OutboundShipment[]): Promise<{ durable: boolean; supabaseOk: boolean }> {
  writeOutboundStorage(rows);
  const idbOk = typeof window === "undefined" ? true : await writeOutboundIndexed(rows);
  const durable = idbOk;

  if (!hasSupabase || !supabase) {
    return { durable, supabaseOk: true };
  }

  const payload = rows.map(toDb);
  let { error } = await supabase.from("outbound_shipments").upsert(payload, { onConflict: "id" });
  if (error) {
    const stripped = payload.map(stripExtendedForLegacySupabase);
    const second = await supabase.from("outbound_shipments").upsert(stripped, { onConflict: "id" });
    error = second.error;
  }
  return { durable, supabaseOk: !error };
}

/** @deprecated Используйте persistOutboundDurably — оставлено для совместимости импорта. */
export async function flushMockOutboundToDb(rows: OutboundShipment[]) {
  const r = await persistOutboundDurably(rows);
  return r.supabaseOk;
}
