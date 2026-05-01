import type { ProductCatalogItem } from "@/types/domain";

/** Первая колонка — артикул, штрихкод или внутренний id (как в каталоге). */
export type InboundPasteParsedRow = { code: string; qty: number };

export type ParseInboundWarehousePasteResult =
  | { ok: true; rows: InboundPasteParsedRow[] }
  | { ok: false; message: string };

/**
 * Парсинг вставки из Excel: непустая строка — «код, количество» (разделитель — запятая).
 */
export function parseInboundWarehousePaste(text: string): ParseInboundWarehousePasteResult {
  const rows: InboundPasteParsedRow[] = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();
    if (line === "") continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      return {
        ok: false,
        message: `Строка ${i + 1}: ожидается формат «артикул или штрихкод, количество»`,
      };
    }
    const [code, qtyRaw] = parts;
    const qtyNum = Number(qtyRaw);
    const qty = Math.trunc(qtyNum);
    if (!Number.isFinite(qtyNum) || qty !== qtyNum || qty <= 0) {
      return { ok: false, message: `Строка ${i + 1}: количество должно быть целым числом > 0` };
    }
    rows.push({ code, qty });
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
