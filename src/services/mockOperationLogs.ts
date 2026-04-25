import type { OperationLog } from "@/types/domain";

const STORAGE_KEY = "ffmsk.mock.operationLogs";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readStorage(): OperationLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OperationLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(rows: OperationLog[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function getOperationLogsSync(): OperationLog[] {
  return readStorage();
}

/**
 * Возвращает логи, новые сверху.
 */
export async function fetchOperationLogs(): Promise<OperationLog[]> {
  await delay(60);
  return getSortedLogs(readStorage());
}

function getSortedLogs(rows: OperationLog[]): OperationLog[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Персист в localStorage, возвращает полную запись.
 * Данные type в хранилище — как в коде (RECEIVING_CREATED и т.д.).
 */
export function addOperationLog(
  entry: Omit<OperationLog, "id"> & { id?: string; createdAt?: string },
): OperationLog {
  const id = entry.id ?? `ol-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const row: OperationLog = {
    id,
    type: entry.type,
    taskId: entry.taskId,
    taskNumber: entry.taskNumber,
    legalEntityId: entry.legalEntityId,
    legalEntityName: entry.legalEntityName,
    description: entry.description,
    createdAt,
  };
  const next = [row, ...readStorage()];
  writeStorage(next);
  return row;
}
