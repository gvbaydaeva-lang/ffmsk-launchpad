/** Статус строки план/факт для приёмки и упаковки */
export type PlanFactLineStatus = "ok" | "short" | "surplus" | "error";

export function planFactLineStatus(planned: number, factual: number): PlanFactLineStatus {
  const plan = Math.max(0, Math.trunc(planned));
  const fact = Math.max(0, Math.trunc(factual));
  if (plan === 0 && fact > 0) return "error";
  if (fact < plan) return "short";
  if (fact > plan) return "surplus";
  return "ok";
}

export function planFactRemaining(plan: number, fact: number): number {
  return Math.max(0, Math.trunc(plan) - Math.trunc(fact));
}

export function planFactOverrun(plan: number, fact: number): number {
  return Math.max(0, Math.trunc(fact) - Math.trunc(plan));
}

/** Текст расхождения под строкой или в ячейке */
export function planFactDiscrepancyText(plan: number, fact: number): string | null {
  const d = Math.trunc(plan) - Math.trunc(fact);
  if (d > 0) return `Не хватает ${d} шт`;
  if (d < 0) return `Лишнее количество +${-d}`;
  return null;
}

export function planFactRowBgClass(plan: number, fact: number): string {
  const st = planFactLineStatus(plan, fact);
  if (st === "short") return "bg-amber-50/90";
  if (st === "surplus" || st === "error") return "bg-red-50/90";
  return "";
}
