/** Короткий статус в колонке «Тип операции» (type в данных не меняем) */
const shortStatusByType: Record<string, string> = {
  RECEIVING_CREATED: "Создано",
  SHIPPING_CREATED: "Создано",
  SHIPMENT_CONFIRMED: "Отгрузка",
  SHIPMENT_DIFF_COMPLETED: "Отгрузка с расхождением",
  SHIPMENT_CANCELLED: "Отмена отгрузки",
  SHIPPING_PICK: "Подбор",
  SHIPPING_PICK_CANCEL: "Отмена подбора",
  PACK_ITEM: "Упаковка",
  RECEIVING_STARTED: "В работе",
  PACKING_STARTED: "В работе",
  RECEIVING_COMPLETED: "Завершено",
  PACKING_COMPLETED: "Завершено",
  INVENTORY_CHANGED: "Остатки",
  ITEM_SCANNED: "Сканирование",
  ERROR_DETECTED: "Ошибка",
  SCAN_ERROR: "Ошибка",
  TASK_MISMATCH: "Расхождение",
  STOCK_ERROR: "Остатки",
  TASK_COMPLETED_WITH_MISMATCH: "С расхождением",
};

export function formatOperationLogShortStatus(type: string): string {
  return shortStatusByType[type] ?? type;
}

const badgeBase =
  "inline-flex max-w-full shrink-0 items-center rounded border px-1.5 py-0 text-[10px] font-semibold leading-tight whitespace-nowrap";

/** Бейдж для колонки «Тип операции» */
export function operationLogTypeBadgeClass(type: string): string {
  switch (type) {
    case "RECEIVING_CREATED":
    case "SHIPPING_CREATED":
      return `${badgeBase} border-blue-200 bg-blue-50 text-blue-800`;
    case "SHIPMENT_CONFIRMED":
      return `${badgeBase} border-emerald-200 bg-emerald-50 text-emerald-900`;
    case "SHIPMENT_DIFF_COMPLETED":
      return `${badgeBase} border-amber-200 bg-amber-50 text-amber-900`;
    case "SHIPMENT_CANCELLED":
      return `${badgeBase} border-slate-200 bg-slate-100 text-slate-700`;
    case "SHIPPING_PICK":
    case "SHIPPING_PICK_CANCEL":
      return `${badgeBase} border-sky-200 bg-sky-50 text-sky-900`;
    case "PACK_ITEM":
      return `${badgeBase} border-violet-200 bg-violet-50 text-violet-900`;
    case "RECEIVING_STARTED":
    case "PACKING_STARTED":
      return `${badgeBase} border-violet-200 bg-violet-50 text-violet-800`;
    case "RECEIVING_COMPLETED":
    case "PACKING_COMPLETED":
      return `${badgeBase} border-emerald-200 bg-emerald-50 text-emerald-800`;
    case "INVENTORY_CHANGED":
      return `${badgeBase} border-amber-200 bg-amber-50 text-amber-900`;
    case "ITEM_SCANNED":
      return `${badgeBase} border-slate-200 bg-slate-100 text-slate-700`;
    case "ERROR_DETECTED":
      return `${badgeBase} border-red-200 bg-red-50 text-red-800`;
    case "SCAN_ERROR":
      return `${badgeBase} border-red-200 bg-red-50 text-red-800`;
    case "TASK_MISMATCH":
      return `${badgeBase} border-amber-200 bg-amber-50 text-amber-900`;
    case "STOCK_ERROR":
      return `${badgeBase} border-amber-200 bg-amber-50 text-amber-900`;
    case "TASK_COMPLETED_WITH_MISMATCH":
      return `${badgeBase} border-amber-200 bg-amber-50 text-amber-900`;
    default:
      return `${badgeBase} border-slate-200 bg-white text-slate-600`;
  }
}

/** Нормализация старых формулировок только для отображения (storage не трогаем). */
export function formatOperationLogDescription(description: string): string {
  if (description.startsWith("Изменение остатков по")) {
    return description.replace(/^Изменение остатков по/, "Остатки обновлены по");
  }
  return description;
}
