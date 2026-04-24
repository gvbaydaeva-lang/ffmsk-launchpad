/**
 * Общий «ERP / Excel» вид таблиц (отгрузка, приёмка, каталог).
 * Используйте вместе: EXCEL_TABLE_WRAP + table с EXCEL_TABLE_BASE.
 */

export const WAREHOUSE_HEADER_CLASSES = [
  "border-b border-amber-300/70 bg-amber-200/95 text-amber-950",
  "border-b border-orange-300/70 bg-orange-200/95 text-orange-950",
  "border-b border-emerald-300/70 bg-emerald-200/95 text-emerald-950",
  "border-b border-cyan-300/70 bg-cyan-200/95 text-cyan-950",
  "border-b border-sky-300/70 bg-sky-200/95 text-sky-950",
  "border-b border-violet-300/70 bg-violet-200/95 text-violet-950",
] as const;

/** Заголовки фиксированных колонок (как «левый блок» в Excel). */
export const STATIC_HEADER_BASE =
  "border-b border-r border-slate-300 bg-teal-100/95 px-1.5 py-1 text-left text-[11px] font-semibold text-slate-800";

/** Лёгкая вертикальная подсветка под цветом заголовка склада. */
export const WAREHOUSE_COLUMN_CELL_BGS = [
  "bg-amber-50/80",
  "bg-orange-50/80",
  "bg-emerald-50/80",
  "bg-cyan-50/80",
  "bg-sky-50/80",
  "bg-violet-50/80",
] as const;

export const EXCEL_TABLE_BASE =
  "w-full border-collapse border border-slate-300 text-[11px] leading-tight text-slate-800";

export const EXCEL_TABLE_WRAP = "overflow-x-auto rounded-md border border-slate-300 bg-white shadow-sm";

/** Зебра + опциональный алерт строки. */
export function excelRowBg(rowIdx: number, alert?: boolean): string {
  if (alert) return "bg-red-100/90 dark:bg-red-950/35";
  return rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/95";
}

/** Sticky: колонка фото (узкая). */
export const EXCEL_STICKY_PHOTO_TH =
  "sticky left-0 z-30 border-b border-r border-slate-300 bg-teal-100/95 px-1 py-1 text-center text-[11px] font-semibold text-slate-800 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.12)]";

export const EXCEL_STICKY_PHOTO_TD =
  "sticky left-0 z-20 border-b border-r border-slate-200 px-1 py-0.5 align-middle shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]";

/** Sticky: название / товар (сразу после фото w-11). */
export const EXCEL_STICKY_NAME_TH =
  "sticky left-11 z-30 min-w-[200px] border-b border-r border-slate-300 bg-teal-100/95 px-1.5 py-1 text-left text-[11px] font-semibold text-slate-800 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.12)]";

export const EXCEL_STICKY_NAME_TD =
  "sticky left-11 z-20 min-w-[200px] max-w-[280px] border-b border-r border-slate-200 px-1.5 py-0.5 align-middle shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]";
