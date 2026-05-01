export type InboundPasteParsedRow = { productId: string; qty: number };

export type ParseInboundWarehousePasteResult =
  | { ok: true; rows: InboundPasteParsedRow[] }
  | { ok: false; message: string };

/**
 * Парсинг вставки «как из Excel»: каждая непустая строка — productId,qty (запятая как разделитель).
 */
export function parseInboundWarehousePaste(text: string): ParseInboundWarehousePasteResult {
  const rows: InboundPasteParsedRow[] = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();
    if (line === "") continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      return { ok: false, message: `Строка ${i + 1}: ожидается формат productId,qty` };
    }
    const [productId, qtyRaw] = parts;
    const qtyNum = Number(qtyRaw);
    const qty = Math.trunc(qtyNum);
    if (!Number.isFinite(qtyNum) || qty !== qtyNum || qty <= 0) {
      return { ok: false, message: `Строка ${i + 1}: количество должно быть целым числом > 0` };
    }
    rows.push({ productId, qty });
  }
  return { ok: true, rows };
}
