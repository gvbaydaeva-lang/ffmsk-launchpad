import type {
  InboundWarehouseItem,
  InboundWarehousePlacement,
  InboundWarehouseRequest,
  InboundWarehouseRequestStatus,
  InboundWarehouseReceivingMode,
  InventoryMovement,
} from "@/types/domain";
import { fetchMockProductCatalog } from "@/services/mockProductCatalog";
import { fetchMockLegalEntities } from "@/services/mockWms";
import {
  addInventoryMovements,
  getInventoryMovementsSync,
  hasReceivingInboundMovements,
  hasWarehouseInboundPlacementTransfers,
} from "@/services/mockInventoryMovements";
import { fetchMockLocations } from "@/services/mockLocations";

const STORAGE_KEY = "ffmsk.api.inbounds";

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function normalizePlacementsFromRaw(raw: unknown): InboundWarehousePlacement[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: InboundWarehousePlacement[] = [];
  for (const p of arr) {
    const o = p as { id?: string; locationId?: string; qty?: number };
    const locationId = String(o.locationId ?? "").trim();
    const q = Math.trunc(Number(o.qty) || 0);
    if (!locationId || q <= 0) continue;
    const id = String(o.id ?? "").trim() || `plc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    out.push({ id, locationId, qty: q });
  }
  return out;
}

function normalizeInboundItem(it: InboundWarehouseItem): InboundWarehouseItem {
  const rq = Number(it.receivedQty);
  const receivedQty = Number.isFinite(rq) && rq >= 0 ? Math.trunc(rq) : 0;
  return {
    ...it,
    plannedQty: Math.max(0, Math.trunc(Number(it.plannedQty) || 0)),
    receivedQty,
    placements: normalizePlacementsFromRaw((it as InboundWarehouseItem).placements),
  };
}

/** Id зоны приёмки для движений (без размещения по ячейкам хранения) */
export const WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID = "RECEIVING_AREA";

function normalizeInboundWarehouseRequest(raw: InboundWarehouseRequest): InboundWarehouseRequest {
  const status: InboundWarehouseRequestStatus =
    raw.status === "cancelled"
      ? "cancelled"
      : raw.status === "placed"
        ? "placed"
        : raw.status === "received"
          ? "received"
          : raw.status === "receiving"
            ? "receiving"
            : "new";
  let receivingMode: InboundWarehouseReceivingMode | null = null;
  if (raw.receivingMode === "manual" || raw.receivingMode === "scan") {
    receivingMode = raw.receivingMode;
  }
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const originRaw = (raw as InboundWarehouseRequest).originInboundId;
  const originInboundId =
    typeof originRaw === "string" && originRaw.trim() ? originRaw.trim() : null;
  return {
    ...raw,
    status,
    receivingMode,
    originInboundId,
    items: itemsRaw.map((x) => normalizeInboundItem(x as InboundWarehouseItem)),
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

function inboundHasContinuationInList(originId: string, rows: InboundWarehouseRequest[]): boolean {
  const o = (originId || "").trim();
  if (!o) return false;
  return rows.some((r) => (r.originInboundId || "").trim() === o);
}

/** Остаток плана по строкам после фиксации факта. Нет строки продолжения при recv ≥ planned и при перевыполнении (recv > planned). */
function continuationItemsFromPartialReceive(row: InboundWarehouseRequest): { productId: string; plannedQty: number }[] {
  const out: { productId: string; plannedQty: number }[] = [];
  for (const it of row.items) {
    const planned = Math.max(0, Math.trunc(Number(it.plannedQty) || 0));
    const recv = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    if (recv >= planned) continue;
    const remainingQty = planned - recv;
    if (remainingQty > 0 && it.productId?.trim()) {
      out.push({ productId: it.productId.trim(), plannedQty: remainingQty });
    }
  }
  return out;
}

function appendContinuationInbound(
  rows: InboundWarehouseRequest[],
  closedRow: InboundWarehouseRequest,
  bodyItems: { productId: string; plannedQty: number }[],
): InboundWarehouseRequest[] {
  if (bodyItems.length === 0) return rows;
  const createdAt = new Date().toISOString();
  const id = `inb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const lines: InboundWarehouseItem[] = bodyItems.map((it, idx) => ({
    id: `${id}-line-${idx + 1}`,
    inboundId: id,
    productId: it.productId.trim(),
    plannedQty: Math.trunc(Number(it.plannedQty)),
    receivedQty: 0,
    placements: [],
  }));
  const continuation: InboundWarehouseRequest = {
    id,
    originInboundId: closedRow.id,
    partnerId: closedRow.partnerId,
    plannedDate: closedRow.plannedDate,
    status: "new",
    receivingMode: null,
    comment: closedRow.comment,
    createdAt,
    items: lines,
  };
  return [continuation, ...rows];
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

/** Отмена приёмки без движений и откатов; только «Новая» / «Приёмка». Идемпотентно для «Отменена». */
export async function cancelInbound(inboundId: string): Promise<InboundWarehouseRequest> {
  await delay(85);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === inboundId);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status === "cancelled") {
    return row;
  }
  if (row.status === "received" || row.status === "placed") {
    throw new Error("Нельзя отменить заявку после завершения приёмки или размещения");
  }
  if (row.status !== "new" && row.status !== "receiving") {
    throw new Error("Отмена доступна только для заявок в статусах «Новая» или «Приёмка»");
  }
  const updated: InboundWarehouseRequest = {
    ...row,
    status: "cancelled",
    receivingMode: null,
  };
  const next = [...rows];
  next[idx] = updated;
  writeStored(next);
  return updated;
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
  if (row.status === "cancelled") {
    throw new Error("Заявка отменена");
  }
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

/** Обновление факта по строке (только при status === receiving, без движений и смены статуса) */
export async function updateInboundReceivedQty(
  inboundId: string,
  itemId: string,
  receivedQty: number,
): Promise<InboundWarehouseRequest> {
  const q = Math.trunc(Number(receivedQty));
  if (!Number.isFinite(q) || q < 0) {
    throw new Error("Количество должно быть целым числом ≥ 0");
  }
  await delay(70);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === inboundId);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status === "cancelled") {
    throw new Error("Заявка отменена");
  }
  if (row.status !== "receiving") {
    throw new Error("Факт можно вносить только для заявки в статусе «Приёмка»");
  }
  const lineIdx = row.items.findIndex((it) => it.id === itemId);
  if (lineIdx < 0) throw new Error("Строка заявки не найдена");
  const nextItems = row.items.map((it, i) =>
    i === lineIdx ? { ...it, receivedQty: q } : it,
  );
  const updated: InboundWarehouseRequest = { ...row, items: nextItems };
  const next = [...rows];
  next[idx] = updated;
  writeStored(next);
  return updated;
}

/**
 * Закрыть приёмку по заявке: статус received, движения приёмки только по строкам с receivedQty > 0,
 * без размещения (место операции — зона приёмки).
 */
export async function completeInboundReceiving(inboundId: string): Promise<InboundWarehouseRequest> {
  await delay(140);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === inboundId);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status === "cancelled") {
    throw new Error("Заявка отменена");
  }
  if (row.status !== "receiving") {
    throw new Error('Завершить можно только заявку в статусе «Приёмка»');
  }
  if (!row.items.some((it) => Math.trunc(Number(it.receivedQty) || 0) > 0)) {
    throw new Error("Укажите принятое количество хотя бы по одной позиции");
  }

  const invSnapshot = typeof window !== "undefined" ? getInventoryMovementsSync() : [];
  if (hasReceivingInboundMovements(inboundId, invSnapshot)) {
    throw new Error("По этой заявке движения приёмки уже созданы");
  }

  const [catalog, entities] = await Promise.all([fetchMockProductCatalog(), fetchMockLegalEntities()]);
  const leName = entities.find((e) => e.id === row.partnerId)?.shortName ?? row.partnerId;
  const ts = new Date().toISOString();
  const stamp = Date.now();

  const moves: InventoryMovement[] = [];
  for (let i = 0; i < row.items.length; i += 1) {
    const it = row.items[i];
    const q = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    if (q <= 0) continue;
    const product = catalog.find((p) => p.id === it.productId);
    moves.push({
      id: `im-whreq-${row.id}-${it.id}-${stamp}-${i}`,
      type: "INBOUND",
      source: "receiving",
      taskId: row.id,
      taskNumber: row.id,
      legalEntityId: row.partnerId,
      legalEntityName: leName,
      warehouseName: "Зона приёмки",
      locationId: WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID,
      itemId: it.id,
      productId: it.productId,
      name: (product?.name ?? "—").trim() || "—",
      sku: product?.supplierArticle,
      article: (product?.supplierArticle ?? "").trim() || "—",
      barcode: (product?.barcode ?? "").trim() || "—",
      marketplace: "WB",
      color: (product?.color ?? "—").trim() || "—",
      size: (product?.size ?? "—").trim() || "—",
      qty: q,
      createdAt: ts,
    });
  }

  if (moves.length === 0) {
    throw new Error("Нет строк с положительным принятым количеством");
  }

  const rowsBeforeWrite = readStored();
  const idxFresh = rowsBeforeWrite.findIndex((r) => r.id === inboundId);
  if (idxFresh < 0) throw new Error("Заявка не найдена");
  if (rowsBeforeWrite[idxFresh].status !== "receiving") {
    throw new Error("Заявка уже не в статусе «Приёмка», повторно завершить приёмку нельзя");
  }
  const invNow = typeof window !== "undefined" ? getInventoryMovementsSync() : [];
  if (hasReceivingInboundMovements(inboundId, invNow)) {
    throw new Error("По этой заявке движения приёмки уже созданы");
  }

  addInventoryMovements(moves);

  const rowsAfterMoves = readStored();
  const idxAfter = rowsAfterMoves.findIndex((r) => r.id === inboundId);
  if (idxAfter < 0) throw new Error("Заявка не найдена");

  const updated: InboundWarehouseRequest = {
    ...rowsAfterMoves[idxAfter],
    status: "received",
  };
  const next = [...rowsAfterMoves];
  next[idxAfter] = updated;

  let toStore = next;
  if (!inboundHasContinuationInList(inboundId, toStore)) {
    const continuationBody = continuationItemsFromPartialReceive(updated);
    if (continuationBody.length > 0) {
      const reread = readStored();
      if (inboundHasContinuationInList(inboundId, reread)) {
        const rIdx = reread.findIndex((r) => r.id === inboundId);
        toStore =
          rIdx >= 0 ? reread.map((r, i) => (i === rIdx ? { ...r, status: "received" } : r)) : next;
      } else {
        const rIdx = reread.findIndex((r) => r.id === inboundId);
        const base =
          rIdx >= 0 ? reread.map((r, i) => (i === rIdx ? { ...r, status: "received" } : r)) : next;
        toStore = appendContinuationInbound(base, updated, continuationBody);
      }
    }
  }

  writeStored(toStore);

  const afterWrite = readStored();
  const finalIdx = afterWrite.findIndex((r) => r.id === inboundId);
  return finalIdx >= 0 ? afterWrite[finalIdx] : updated;
}

/** Обновление плана размещения по строке (только статус «Принято», без движений и без смены receivedQty). */
export type InboundPlacementInput = { id?: string; locationId: string; qty: number };

async function assertStorageLocation(locationId: string): Promise<void> {
  const locs = await fetchMockLocations();
  const loc = locs.find((l) => l.id === (locationId || "").trim());
  if (!loc || loc.type !== "storage") {
    throw new Error("Выберите ячейку хранения из справочника");
  }
}

function normalizeInboundPlacementWrites(placements: InboundPlacementInput[]): InboundWarehousePlacement[] {
  const stamp = Date.now();
  const out: InboundWarehousePlacement[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    const locationId = String(p.locationId ?? "").trim();
    const q = Math.trunc(Number(p.qty));
    if (!locationId) {
      throw new Error(`Размещение ${i + 1}: укажите место`);
    }
    if (!Number.isFinite(q) || q < 1) {
      throw new Error(`Размещение ${i + 1}: количество должно быть целым числом больше 0`);
    }
    const pid = String(p.id ?? "").trim() || `plc-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    out.push({ id: pid, locationId, qty: q });
  }
  return out;
}

export async function updateInboundPlacement(
  inboundId: string,
  itemId: string,
  placements: InboundPlacementInput[],
): Promise<InboundWarehouseRequest> {
  await delay(90);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === inboundId);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status === "placed") {
    throw new Error("Заявка уже размещена, изменения недоступны");
  }
  if (row.status === "cancelled") {
    throw new Error("Заявка отменена");
  }
  if (row.status !== "received") {
    throw new Error("Размещение можно вносить только для заявки в статусе «Принято»");
  }
  const lineIdx = row.items.findIndex((it) => it.id === itemId);
  if (lineIdx < 0) throw new Error("Строка заявки не найдена");

  const line = row.items[lineIdx];
  const receivedQty = Math.max(0, Math.trunc(Number(line.receivedQty) || 0));
  const nextPlacements = normalizeInboundPlacementWrites(Array.isArray(placements) ? placements : []);
  for (const np of nextPlacements) {
    await assertStorageLocation(np.locationId);
  }
  if (receivedQty === 0 && nextPlacements.length > 0) {
    throw new Error("Для строки без приёмки размещение недоступно");
  }
  const sumPl = nextPlacements.reduce((s, p) => s + p.qty, 0);
  if (sumPl > receivedQty) {
    throw new Error("Сумма по размещениям не может превышать принятое количество по строке");
  }

  const nextItems = row.items.map((it, i) => (i === lineIdx ? { ...it, placements: nextPlacements } : it));
  const updated: InboundWarehouseRequest = { ...row, items: nextItems };
  const next = [...rows];
  next[idx] = updated;
  writeStored(next);
  return updated;
}

/**
 * Завершить размещение: перемещение из зоны приёмки в ячейки, сумма placements = receivedQty по каждой строке с приёмкой.
 */
export async function completeInboundPlacement(inboundId: string): Promise<InboundWarehouseRequest> {
  await delay(170);
  const rows = readStored();
  const idx = rows.findIndex((r) => r.id === inboundId);
  if (idx < 0) throw new Error("Заявка не найдена");
  const row = rows[idx];
  if (row.status === "placed") {
    throw new Error("Размещение уже завершено");
  }
  if (row.status === "cancelled") {
    throw new Error("Заявка отменена");
  }
  if (row.status !== "received") {
    throw new Error("Завершить размещение можно только для заявки в статусе «Принято»");
  }

  const invSnapshot = typeof window !== "undefined" ? getInventoryMovementsSync() : [];
  if (hasWarehouseInboundPlacementTransfers(inboundId, invSnapshot)) {
    throw new Error("По этой заявке размещение уже отражено в движениях");
  }

  const locs = await fetchMockLocations();
  const assertLoc = (lid: string) => {
    const loc = locs.find((l) => l.id === lid.trim());
    if (!loc || loc.type !== "storage") throw new Error("Некорректная ячейка размещения в заявке");
  };

  for (const it of row.items) {
    const rq = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    const sumPl = it.placements.reduce((s, p) => s + p.qty, 0);
    if (rq === 0) {
      if (sumPl !== 0) throw new Error("Для непринятых строк не должно быть размещения");
      continue;
    }
    if (sumPl !== rq) {
      throw new Error("Распределите ровно всё принятое количество по ячейкам по каждой строке с приёмом");
    }
    for (const p of it.placements) {
      assertLoc(p.locationId);
    }
  }

  const [catalog, entities] = await Promise.all([fetchMockProductCatalog(), fetchMockLegalEntities()]);
  const leName = entities.find((e) => e.id === row.partnerId)?.shortName ?? row.partnerId;
  const ts = new Date().toISOString();
  const stamp = Date.now();
  const moves: InventoryMovement[] = [];

  let moveIdx = 0;
  for (const it of row.items) {
    const rq = Math.max(0, Math.trunc(Number(it.receivedQty) || 0));
    if (rq <= 0) continue;
    const product = catalog.find((p) => p.id === it.productId);
    for (const p of it.placements) {
      moves.push({
        id: `im-whplc-${row.id}-${it.id}-${p.id}-${stamp}-${moveIdx}`,
        type: "TRANSFER",
        source: "placement",
        taskId: row.id,
        taskNumber: row.id,
        legalEntityId: row.partnerId,
        legalEntityName: leName,
        warehouseName: "Зона приёмки",
        fromLocationId: WAREHOUSE_INBOUND_RECEIVING_LOCATION_ID,
        locationId: p.locationId,
        itemId: it.id,
        productId: it.productId,
        name: (product?.name ?? "—").trim() || "—",
        sku: product?.supplierArticle,
        article: (product?.supplierArticle ?? "").trim() || "—",
        barcode: (product?.barcode ?? "").trim() || "—",
        marketplace: "WB",
        color: (product?.color ?? "—").trim() || "—",
        size: (product?.size ?? "—").trim() || "—",
        qty: p.qty,
        createdAt: ts,
      });
      moveIdx += 1;
    }
  }

  if (moves.length === 0) {
    throw new Error("Нет размещений для создания движений");
  }

  const rowsBeforeWrite = readStored();
  const idxFresh = rowsBeforeWrite.findIndex((r) => r.id === inboundId);
  if (idxFresh < 0) throw new Error("Заявка не найдена");
  if (rowsBeforeWrite[idxFresh].status !== "received") {
    throw new Error("Заявка уже не в статусе «Принято», повторно завершить размещение нельзя");
  }
  const invNow = typeof window !== "undefined" ? getInventoryMovementsSync() : [];
  if (hasWarehouseInboundPlacementTransfers(inboundId, invNow)) {
    throw new Error("По этой заявке размещение уже отражено в движениях");
  }

  addInventoryMovements(moves);

  const rowsAfterMoves = readStored();
  const idxAfter = rowsAfterMoves.findIndex((r) => r.id === inboundId);
  if (idxAfter < 0) throw new Error("Заявка не найдена");

  const updated: InboundWarehouseRequest = {
    ...rowsAfterMoves[idxAfter],
    status: "placed",
  };
  const next = [...rowsAfterMoves];
  next[idxAfter] = updated;
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
    receivedQty: 0,
    placements: [],
  }));
  const row: InboundWarehouseRequest = {
    id,
    originInboundId: null,
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
