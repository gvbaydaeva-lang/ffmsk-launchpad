/** Подписи для юзера, тип в данных не меняем */
export const operationLogTypeLabel: Record<string, string> = {
  RECEIVING_CREATED: "Создание приёмки",
  RECEIVING_STARTED: "Приёмка в работе",
  RECEIVING_COMPLETED: "Приёмка завершена",
  SHIPPING_CREATED: "Создание отгрузки",
  PACKING_STARTED: "Сборка начата",
  PACKING_COMPLETED: "Сборка завершена",
  INVENTORY_CHANGED: "Изменение остатков",
  ITEM_SCANNED: "Сканирование товара",
};

export function formatOperationLogType(type: string): string {
  return operationLogTypeLabel[type] ?? type;
}

const completedTypes = new Set(["RECEIVING_COMPLETED", "PACKING_COMPLETED"]);
const createdTypes = new Set(["RECEIVING_CREATED", "SHIPPING_CREATED"]);
const inWorkTypes = new Set(["RECEIVING_STARTED", "PACKING_STARTED", "ITEM_SCANNED"]);

/** Цвет для колонки «Тип» в UI */
export function operationLogTypeClass(type: string): string {
  if (completedTypes.has(type)) return "whitespace-nowrap text-emerald-700";
  if (createdTypes.has(type)) return "whitespace-nowrap text-blue-600";
  if (inWorkTypes.has(type)) return "whitespace-nowrap text-violet-600";
  if (type === "INVENTORY_CHANGED") return "whitespace-nowrap text-teal-700";
  return "whitespace-nowrap text-slate-700";
}
