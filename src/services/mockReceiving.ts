import type { InboundSupply, Marketplace } from "@/types/domain";
import { hasSupabase, supabase } from "@/lib/supabaseClient";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const INBOUND_STORAGE_KEY = "ffmsk.mock.inbound";
const IDB_NAME = "ffmsk-wms";
const IDB_VERSION = 1;
const IDB_STORE = "inbound_supplies";

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

function openInboundIdb(): Promise<IDBDatabase | null> {
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

async function writeInboundIndexed(rows: InboundSupply[]): Promise<boolean> {
  const db = await openInboundIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const row of rows) {
        store.put(JSON.parse(JSON.stringify(row)) as InboundSupply);
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

async function readInboundIndexed(): Promise<InboundSupply[] | null> {
  const db = await openInboundIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const rows = req.result as InboundSupply[];
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

type InboundDbRow = {
  id: string;
  legal_entity_id: string;
  document_no: string;
  supplier: string;
  items: InboundSupply["items"];
  destination_warehouse: string;
  marketplace: Marketplace;
  expected_units: number;
  received_units: number | null;
  status: InboundSupply["status"];
  eta: string;
};

function toDb(row: InboundSupply): InboundDbRow {
  return {
    id: row.id,
    legal_entity_id: row.legalEntityId,
    document_no: row.documentNo,
    supplier: row.supplier,
    items: row.items,
    destination_warehouse: row.destinationWarehouse,
    marketplace: row.marketplace,
    expected_units: row.expectedUnits,
    received_units: row.receivedUnits,
    status: row.status,
    eta: row.eta,
  };
}

function fromDb(row: InboundDbRow & { legalEntityId?: string }): InboundSupply {
  const legalEntityId = row.legal_entity_id ?? row.legalEntityId ?? "";
  return {
    id: row.id,
    legalEntityId,
    documentNo: row.document_no ?? (row as { documentNo?: string }).documentNo ?? "",
    supplier: row.supplier,
    items: Array.isArray(row.items) ? row.items : [],
    destinationWarehouse:
      row.destination_warehouse ?? (row as { destinationWarehouse?: string }).destinationWarehouse ?? "",
    marketplace: row.marketplace,
    expectedUnits: row.expected_units ?? (row as { expectedUnits?: number }).expectedUnits ?? 0,
    receivedUnits: row.received_units ?? (row as { receivedUnits?: number | null }).receivedUnits ?? null,
    status: row.status,
    eta: row.eta,
  };
}

export async function fetchMockInboundSupplies(): Promise<InboundSupply[]> {
  await delay(130);
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("inbound_supplies").select("*").order("eta", { ascending: false });
    if (!error && Array.isArray(data)) {
      const mapped = (data as InboundDbRow[]).map(fromDb);
      if (mapped.length > 0) {
        writeInboundStorage(mapped);
        void writeInboundIndexed(mapped);
        return mapped;
      }
    }
  }
  const fromIdb = await readInboundIndexed();
  if (fromIdb && fromIdb.length) {
    writeInboundStorage(fromIdb);
    return fromIdb;
  }
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
  void writeInboundIndexed(next);
  return next;
}

export function saveMockInbound(rows: InboundSupply[]) {
  writeInboundStorage(rows);
  void writeInboundIndexed(rows);
}

/**
 * Гарантированная запись приёмки: localStorage + IndexedDB; при наличии конфига — upsert в Supabase.
 * Возвращает durable=true, если локальный слой записан; supabaseOk — отдельно про облако.
 */
export async function persistInboundDurably(rows: InboundSupply[]): Promise<{ durable: boolean; supabaseOk: boolean }> {
  writeInboundStorage(rows);
  const idbOk = typeof window === "undefined" ? true : await writeInboundIndexed(rows);
  const durable = idbOk;

  if (!hasSupabase || !supabase) {
    return { durable, supabaseOk: true };
  }

  const payload = rows.map(toDb);
  const { error } = await supabase.from("inbound_supplies").upsert(payload, { onConflict: "id" });
  return { durable, supabaseOk: !error };
}
