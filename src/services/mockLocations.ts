import type { Location } from "@/types/domain";

const STORAGE_KEY = "ffmsk.mock.locations";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readStorage(): Location[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Location[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(rows: Location[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function createDefaultLocations(): Location[] {
  const now = new Date().toISOString();
  return [
    { id: "loc-receiving", name: "ПРИЕМКА", type: "receiving", createdAt: now },
    { id: "loc-shipping", name: "ОТГРУЗКА", type: "shipping", createdAt: now },
    { id: "loc-a-01", name: "A-01", type: "storage", createdAt: now },
    { id: "loc-a-02", name: "A-02", type: "storage", createdAt: now },
    { id: "loc-b-01", name: "B-01", type: "storage", createdAt: now },
  ];
}

export async function fetchMockLocations(): Promise<Location[]> {
  await delay(80);
  const rows = readStorage();
  if (rows.length > 0) return rows;
  const seeded = createDefaultLocations();
  writeStorage(seeded);
  return seeded;
}

export function appendMockLocation(current: Location[], draft: Omit<Location, "id" | "createdAt">): Location[] {
  const row: Location = {
    id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: draft.name,
    type: draft.type,
    warehouseId: draft.warehouseId,
    createdAt: new Date().toISOString(),
  };
  const next = [row, ...(Array.isArray(current) ? current : [])];
  writeStorage(next);
  return next;
}

export function saveMockLocations(rows: Location[]) {
  writeStorage(Array.isArray(rows) ? rows : []);
}

