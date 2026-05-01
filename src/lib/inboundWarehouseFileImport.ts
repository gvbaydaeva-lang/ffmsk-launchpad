import * as XLSX from "xlsx";

function cellToTrimmedString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const t = Math.trunc(cell);
    return t === cell ? String(t) : String(cell).trim();
  }
  return String(cell).trim();
}

/**
 * Первый лист .xlsx / .csv → многострочный текст для {@link parseInboundWarehousePaste}: code,qty построчно.
 * Колонка A — код, B — количество. Пустые строки пропускаются.
 */
export async function inboundImportFileToPasteText(file: File): Promise<
  { ok: true; text: string } | { ok: false; message: string }
> {
  const name = file.name?.toLowerCase() ?? "";
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return { ok: false, message: "Допускаются только файлы .xlsx и .csv" };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { ok: false, message: "Не удалось прочитать файл" };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: false });
  } catch {
    return { ok: false, message: "Не удалось разобрать файл" };
  }

  const firstName = wb.SheetNames[0];
  if (!firstName?.trim()) {
    return { ok: false, message: "В файле нет листов с данными" };
  }

  const sheet = wb.Sheets[firstName];
  if (!sheet) {
    return { ok: false, message: "Не удалось прочитать первый лист" };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  const outLines: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const code = cellToTrimmedString(row[0]);
    if (!code) continue;
    const qtyRaw = row[1];
    const qtyStr = cellToTrimmedString(qtyRaw);
    if (qtyStr === "") {
      return { ok: false, message: `В файле строка ${i + 1}: заполните количество во второй колонке` };
    }
    if (code.includes(",")) {
      return {
        ok: false,
        message: `В файле строка ${i + 1}: код не должен содержать запятую (используйте два столбца)`,
      };
    }
    outLines.push(`${code},${qtyStr}`);
  }

  if (outLines.length === 0) {
    return { ok: false, message: "В файле нет строк с кодом и количеством" };
  }

  return { ok: true, text: outLines.join("\n") };
}
