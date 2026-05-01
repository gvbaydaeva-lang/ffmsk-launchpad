import type { ProductCatalogItem } from "@/types/domain";
import { parseInboundWarehousePaste, resolveInboundPasteCodeToProductId } from "@/lib/inboundWarehousePasteImport";

export type ResolvedWarehouseImportRow = { productId: string; qty: number };

export type InboundImportDraftLine = { key: string; productId: string; plannedQty: string };

/**
 * Парсинг и сопоставление с каталогом (те же правила, что у приёмки).
 */
export function resolveWarehouseImportPasteRows(
  rawText: string,
  products: readonly ProductCatalogItem[],
): { ok: true; rows: ResolvedWarehouseImportRow[] } | { ok: false; message: string } {
  const parsed = parseInboundWarehousePaste(rawText.trim());
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, message: "Нет данных для загрузки" };
  }
  const resolved: ResolvedWarehouseImportRow[] = [];
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i];
    const match = resolveInboundPasteCodeToProductId(row.code, products);
    if (!match.ok) {
      return { ok: false, message: `Строка ${i + 1}: ${match.message}` };
    }
    resolved.push({ productId: match.productId, qty: row.qty });
  }
  return { ok: true, rows: resolved };
}

/**
 * Одна точка входа: parse + resolve + передать результат в приложение строк (приёмка / отгрузка).
 */
export function resolveAndApplyImport(
  rawText: string,
  products: readonly ProductCatalogItem[],
  onApply: (rows: ResolvedWarehouseImportRow[]) => void,
): { ok: true } | { ok: false; message: string } {
  const r = resolveWarehouseImportPasteRows(rawText, products);
  if (!r.ok) return r;
  onApply(r.rows);
  return { ok: true };
}

export function mergeInboundImportDraftLines(
  prev: InboundImportDraftLine[],
  resolved: ResolvedWarehouseImportRow[],
): InboundImportDraftLine[] {
  const draft = prev.map((l) => ({ ...l }));
  for (const { productId, qty } of resolved) {
    const idx = draft.findIndex((l) => l.productId.trim() === productId);
    if (idx >= 0) {
      const cur = Math.max(0, Math.trunc(Number(draft[idx].plannedQty) || 0));
      draft[idx] = { ...draft[idx], plannedQty: String(cur + qty) };
    } else {
      draft.push({
        key: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId,
        plannedQty: String(qty),
      });
    }
  }
  return draft;
}
