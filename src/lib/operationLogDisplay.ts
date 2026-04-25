/** Короткий статус в колонке «Тип операции» (type в данных не меняем) */
const shortStatusByType: Record<string, string> = {
  RECEIVING_CREATED: "Создано",
  SHIPPING_CREATED: "Создано",
  RECEIVING_STARTED: "В работе",
  PACKING_STARTED: "В работе",
  RECEIVING_COMPLETED: "Завершено",
  PACKING_COMPLETED: "Завершено",
  INVENTORY_CHANGED: "Остатки",
  ITEM_SCANNED: "Сканирование",
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
