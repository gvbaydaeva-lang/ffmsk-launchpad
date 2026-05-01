import * as XLSX from "xlsx";

export type WarehouseImportTemplateKind = "inbound" | "outbound";

const FILENAMES: Record<WarehouseImportTemplateKind, string> = {
  inbound: "шаблон_импорта_приёмки.xlsx",
  outbound: "шаблон_импорта_отгрузки.xlsx",
};

const HEADER_ROW: [string, string] = ["Артикул или штрихкод", "Количество"];

/** Примерные строки (как в подсказках импорта). */
const EXAMPLE_ROWS: (string | number)[][] = [
  ["WB-A-10452", 120],
  ["4601234567890", 48],
  ["ART-DEMO", 24],
];

/**
 * Скачать .xlsx: первый лист, столбцы A–B совместимы с {@link inboundImportFileToPasteText}.
 */
export function downloadWarehouseImportTemplateXlsx(kind: WarehouseImportTemplateKind): void {
  const ws = XLSX.utils.aoa_to_sheet([HEADER_ROW, ...EXAMPLE_ROWS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Импорт");
  XLSX.writeFile(wb, FILENAMES[kind]);
}
