import type { OperationHistoryEvent } from "@/types/domain";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const seed: OperationHistoryEvent[] = [
  {
    id: "ev-1",
    dateIso: "2026-04-21T09:20:00",
    legalEntityId: "le-2",
    actor: "Кладовщик · Иван",
    action: "приёмка",
    productLabel: "Крем для лица · 50 мл",
    quantity: 410,
    comment: "Поставка ПТ-2026-0892",
  },
  {
    id: "ev-2",
    dateIso: "2026-04-21T11:10:00",
    legalEntityId: "le-4",
    actor: "Оператор отгрузки · Ольга",
    action: "отгрузка",
    productLabel: "Бутылка спорт.",
    quantity: 42,
    comment: "Короб WBTR-7782910042",
  },
  {
    id: "ev-3",
    dateIso: "2026-04-21T15:35:00",
    legalEntityId: "le-3",
    actor: "Система",
    action: "начисление",
    productLabel: "Хранение · Джинсы прямые",
    quantity: 60,
    comment: "Дневное начисление хранения",
  },
];

export async function fetchMockOperationHistory(): Promise<OperationHistoryEvent[]> {
  await delay(90);
  return seed.map((x) => ({ ...x }));
}

export function prependOperationEvent(
  current: OperationHistoryEvent[],
  event: Omit<OperationHistoryEvent, "id">,
): OperationHistoryEvent[] {
  const id = `ev-${Date.now()}`;
  return [{ ...event, id }, ...current];
}
