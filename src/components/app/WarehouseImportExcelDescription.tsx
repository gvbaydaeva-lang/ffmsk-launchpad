/**
 * Единые формулировки блока импорта Excel (приёмка и отгрузка).
 */

export const WAREHOUSE_IMPORT_TEXTAREA_PLACEHOLDER = `WB-A-10452, 120\n4601234567890, 48`;

/** Подпись кнопки проверки (одинаково в inbound / outbound). */
export const WAREHOUSE_IMPORT_BTN_CHECK = "Проверить";

export function WarehouseImportExcelDescription() {
  return (
    <p className="text-xs text-slate-600">
      Каждая строка — <span className="font-medium">артикул или штрихкод, количество</span> (разделитель — запятая) или те же два
      столбца в файле <span className="font-mono">.xlsx</span> / <span className="font-mono">.csv</span> (лист 1). Можно также внутренний
      код товара из каталога. Пример: <span className="font-mono">WB-A-10452,120</span>
    </p>
  );
}
