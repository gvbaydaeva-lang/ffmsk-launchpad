import type { InventoryBalanceRow, InventoryMovement } from "@/types/domain";
import { makeInventoryBalanceKeyFromMovement } from "@/lib/inventoryBalanceKey";

const STORAGE_KEY = "ffmsk.mock.inventoryMovements";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readStorage(): InventoryMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InventoryMovement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(rows: InventoryMovement[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  await delay(80);
  return readStorage();
}

export function getInventoryMovementsSync(): InventoryMovement[] {
  return readStorage();
}

/**
 * Проверка qty: INBOUND > 0, OUTBOUND < 0
 */
export function addInventoryMovements(movements: InventoryMovement[]): InventoryMovement[] {
  const current = readStorage();
  for (const m of movements) {
    if (m.type === "INBOUND" && m.qty <= 0) {
      throw new Error("inbound_qty_must_be_positive");
    }
    if (m.type === "OUTBOUND" && m.qty >= 0) {
      throw new Error("outbound_qty_must_be_negative");
    }
  }
  const next = [...movements, ...current];
  writeStorage(next);
  return next;
}

export function getInventoryBalance(movements: InventoryMovement[]): InventoryBalanceRow[] {
  const byKey = new Map<string, { sum: number; sample: InventoryMovement }>();
  for (const m of movements) {
    const key = makeInventoryBalanceKeyFromMovement(m);
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { sum: m.qty, sample: m });
    } else {
      cur.sum += m.qty;
    }
  }
  const rows: InventoryBalanceRow[] = [];
  for (const [key, { sum, sample }] of byKey) {
    rows.push({
      key,
      legalEntityId: sample.legalEntityId,
      legalEntityName: sample.legalEntityName,
      warehouseName: sample.warehouseName ?? "—",
      name: sample.name,
      sku: sample.sku ?? sample.article ?? "",
      article: sample.article ?? sample.sku ?? "",
      barcode: sample.barcode,
      marketplace: sample.marketplace ?? "",
      color: sample.color ?? "—",
      size: sample.size ?? "—",
      balanceQty: sum,
    });
  }
  return rows.sort(
    (a, b) => a.legalEntityName.localeCompare(b.legalEntityName, "ru") || a.name.localeCompare(b.name, "ru"),
  );
}

export function getMovementsByBalanceKey(
  movements: InventoryMovement[],
  key: string,
): InventoryMovement[] {
  return movements
    .filter((m) => makeInventoryBalanceKeyFromMovement(m) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function hasTaskMovements(
  taskId: string,
  type: "INBOUND" | "OUTBOUND",
  movements: InventoryMovement[],
): boolean {
  return movements.some((m) => m.taskId === taskId && m.type === type);
}

export function getBalanceByKeyMap(movements: InventoryMovement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mov of movements) {
    const key = makeInventoryBalanceKeyFromMovement(mov);
    m.set(key, (m.get(key) ?? 0) + mov.qty);
  }
  return m;
}
