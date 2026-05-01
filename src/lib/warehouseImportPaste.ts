import type { ProductCatalogItem } from "@/types/domain";
import { diagnoseInboundWarehousePasteLines, resolveInboundPasteCodeToProductId } from "@/lib/inboundWarehousePasteImport";

export type ResolvedWarehouseImportRow = { productId: string; qty: number };

export type InboundImportDraftLine = { key: string; productId: string; plannedQty: string };

export type WarehouseImportLineIssue = { lineNumber: number; message: string };

export type WarehouseImportInspectionResult = {
  recognizedStructuralLines: number;
  matchedProductsCount: number;
  errors: WarehouseImportLineIssue[];
  resolvedRows: ResolvedWarehouseImportRow[];
};

/**
 * Полная построчная проверка: формат строки и сопоставление с каталогом (общая точка для приёмки и отгрузки).
 */
export function inspectWarehouseImportPaste(
  rawText: string,
  products: readonly ProductCatalogItem[],
): WarehouseImportInspectionResult {
  const diagnoses = diagnoseInboundWarehousePasteLines(rawText.trim());
  const errors: WarehouseImportLineIssue[] = [];
  let recognizedStructuralLines = 0;
  const resolvedRows: ResolvedWarehouseImportRow[] = [];

  for (const d of diagnoses) {
    if (d.kind === "empty") continue;
    if (d.kind === "bad_format") {
      errors.push({ lineNumber: d.lineNum, message: "Ожидается формат «артикул или штрихкод, количество»" });
      continue;
    }
    if (d.kind === "bad_qty") {
      errors.push({ lineNumber: d.lineNum, message: "Количество должно быть целым числом > 0" });
      continue;
    }
    recognizedStructuralLines += 1;
    const match = resolveInboundPasteCodeToProductId(d.row.code, products);
    if (!match.ok) {
      errors.push({ lineNumber: d.lineNum, message: match.message });
      continue;
    }
    resolvedRows.push({ productId: match.productId, qty: d.row.qty });
  }

  if (recognizedStructuralLines === 0 && errors.length === 0) {
    errors.push({ lineNumber: 0, message: "Нет строк с данными для импорта" });
  }

  return {
    recognizedStructuralLines,
    matchedProductsCount: resolvedRows.length,
    errors,
    resolvedRows,
  };
}

/**
 * Парсинг и сопоставление с каталогом (те же правила, что у приёмки).
 */
export function resolveWarehouseImportPasteRows(
  rawText: string,
  products: readonly ProductCatalogItem[],
): { ok: true; rows: ResolvedWarehouseImportRow[] } | { ok: false; message: string } {
  const inspected = inspectWarehouseImportPaste(rawText, products);
  if (inspected.errors.length > 0) {
    const e =
      inspected.errors.find((x) => x.lineNumber > 0) ??
      inspected.errors[0];
    const msg =
      e.lineNumber > 0 ? `Строка ${e.lineNumber}: ${e.message}` : e.message;
    return { ok: false, message: msg };
  }
  if (inspected.resolvedRows.length === 0) {
    return { ok: false, message: "Нет данных для загрузки" };
  }
  return { ok: true, rows: inspected.resolvedRows };
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
