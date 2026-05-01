import type { ProductCatalogItem } from "@/types/domain";

/** Первая колонка — артикул, штрихкод или внутренний id (как в каталоге). */
export type InboundPasteParsedRow = { code: string; qty: number };

export type ParseInboundWarehousePasteResult =
  | { ok: true; rows: InboundPasteParsedRow[] }
  | { ok: false; message: string };

export type InboundWarehousePasteLineDiagnosis =
  | { kind: "empty"; lineNum: number }
  | {
      kind: "bad_format";
      lineNum: number;
    }
  | {
      kind: "bad_qty";
      lineNum: number;
    }
  | { kind: "ok"; lineNum: number; row: InboundPasteParsedRow };

/** Построчная диагностика (пустые строки пропускаются только в результате набора строк с данными). */
export function diagnoseInboundWarehousePasteLines(text: string): InboundWarehousePasteLineDiagnosis[] {
  const out: InboundWarehousePasteLineDiagnosis[] = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNum = i + 1;
    const line = rawLines[i].trim();
    if (line === "") {
      out.push({ kind: "empty", lineNum });
      continue;
    }
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      out.push({ kind: "bad_format", lineNum });
      continue;
    }
    const [code, qtyRaw] = parts;
    const qtyNum = Number(qtyRaw);
    const qty = Math.trunc(qtyNum);
    if (!Number.isFinite(qtyNum) || qty !== qtyNum || qty <= 0) {
      out.push({ kind: "bad_qty", lineNum });
      continue;
    }
    out.push({ kind: "ok", lineNum, row: { code, qty } });
  }
  return out;
}

/**
 * Парсинг вставки из Excel: непустая строка — «код, количество» (разделитель — запятая).
 */
export function parseInboundWarehousePaste(text: string): ParseInboundWarehousePasteResult {
  const diagnoses = diagnoseInboundWarehousePasteLines(text.trim());
  const rows: InboundPasteParsedRow[] = [];
  for (const d of diagnoses) {
    if (d.kind === "empty") continue;
    if (d.kind === "ok") {
      rows.push(d.row);
      continue;
    }
    if (d.kind === "bad_format") {
      return {
        ok: false,
        message: `Строка ${d.lineNum}: ожидается формат «артикул или штрихкод, количество»`,
      };
    }
    return { ok: false, message: `Строка ${d.lineNum}: количество должно быть целым числом > 0` };
  }
  return { ok: true, rows };
}

/**
 * Сопоставление кода строки импорта с товаром: supplierArticle, barcode, затем id.
 * При нескольких разных SKU — ошибка неоднозначности.
 */
export function resolveInboundPasteCodeToProductId(
  code: string,
  products: readonly ProductCatalogItem[],
): { ok: true; productId: string } | { ok: false; message: string } {
  const c = code.trim();
  if (!c) {
    return { ok: false, message: "Пустой код товара" };
  }
  const ids = new Set<string>();
  for (const p of products) {
    if (
      p.id === c ||
      String(p.supplierArticle ?? "").trim() === c ||
      String(p.barcode ?? "").trim() === c
    ) {
      ids.add(p.id);
    }
  }
  if (ids.size === 0) {
    return { ok: false, message: `Товар не найден: ${c}` };
  }
  if (ids.size > 1) {
    return {
      ok: false,
      message: `Несколько товаров совпадают с «${c}». Уточните артикул, штрихкод или внутренний id`,
    };
  }
  const [productId] = [...ids];
  return { ok: true, productId };
}
