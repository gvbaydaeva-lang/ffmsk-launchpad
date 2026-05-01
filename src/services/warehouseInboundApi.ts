import type {
  InboundWarehouseItem,
  InboundWarehouseRequest,
  InboundWarehouseRequestStatus,
  InboundWarehouseReceivingMode,
} from "@/types/domain";

const STORAGE_KEY = "ffmsk.api.inbounds";

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function normalizeInboundWarehouseRequest(raw: InboundWarehouseRequest): InboundWarehouseRequest {
  const status: InboundWarehouseRequestStatus =
    raw.status === "receiving" ? "receiving" : "new";
  let receivingMode: InboundWarehouseReceivingMode | null = null;
  if (raw.receivingMode === "manual" || raw.receivingMode === "scan") {
    receivingMode = raw.receivingMode;
  }
  return {
    ...raw,
    status,
    receivingMode,
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

function readStored(): InboundWarehouseRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InboundWarehouseRequest[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => normalizeInboundWarehouseRequest(row as InboundWarehouseRequest));
  } catch {
    return [];
  }
}

function writeStored(rows: InboundWarehouseRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

/** Тело POST /inbounds */
export type PostInboundsPayload = {
  partnerId: string;
  plannedDate: string;
  comment: string;
  items: { productId: string; plannedQty: number }[];
};

function validatePayload(body: PostInboundsPayload): void {
  if (!body.partnerId.trim()) throw new Error("Укажите партнёра");
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1) throw new Error("Добавьте хотя бы одну позицию");
  for (let i = 0; i < items.length; i++) {
    const q = Number(items[i].plannedQty);
    if (!items[i].productId?.trim()) throw new Error(`Позиция ${i + 1}: выберите товар`);
    if (!Number.isFinite(q) || q <= 0 || Math.trunc(q) !== q) {
      throw new Error(`Позиция ${i + 1}: количество должно быть целым числом > 0`);
    }
  }
}

/** старт операции приёмки по заявке (демо backend) */
export async function startInboundReceiving(id: string, mode: InboundWarehouseReceivingMode): Promise<InboundWarehouseRequest> {
  if (mode !== "manual" && mode !== "scan") {
    throw new Error("Режим должен быть «manual» или «scan»");
  }
  await delay(90);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status !== "new") {
    throw new Error("Приёмку можно начать только для заявки в статусе «Новая»");
  }
  const updated: InboundWarehouseRequest = {
    ...row,
    status: "receiving",
    receivingMode: mode,
  };
  const next = [...rows];
  next[idx] = updated;
  writeStored(next);
  return updated;
}

/** GET /inbounds */
export async function fetchInboundsWarehouseRequests(): Promise<InboundWarehouseRequest[]> {
  await delay(80);
  const rows = readStored();
  return [...rows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** POST /inbounds */
export async function postInboundWarehouseRequest(body: PostInboundsPayload): Promise<InboundWarehouseRequest> {
  await delay(120);
  validatePayload(body);
  const createdAt = new Date().toISOString();
  const id = `inb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const status: InboundWarehouseRequestStatus = "new";
  const lines: InboundWarehouseItem[] = body.items.map((it, idx) => ({
    id: `${id}-line-${idx + 1}`,
    inboundId: id,
    productId: it.productId.trim(),
    plannedQty: Math.trunc(Number(it.plannedQty)),
  }));
  const row: InboundWarehouseRequest = {
    id,
    partnerId: body.partnerId.trim(),
    plannedDate: (body.plannedDate || "").trim().slice(0, 10) || createdAt.slice(0, 10),
    status,
    receivingMode: null,
    comment: (body.comment ?? "").trim(),
    createdAt,
    items: lines,
  };
  const next = [row, ...readStored()];
  writeStored(next);
  return row;
}
