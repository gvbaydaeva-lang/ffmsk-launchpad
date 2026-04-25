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

export function planFactLineStatusLabel(plan: number, fact: number): string {
  const st = planFactLineStatus(plan, fact);
  if (st === "ok") return "Ок";
  if (st === "short") return "Не хватает";
  if (st === "surplus") return "Лишнее";
  return "Ошибка";
}

export function planFactLineBadgeClass(plan: number, fact: number): string {
  const st = planFactLineStatus(plan, fact);
  if (st === "ok") return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (st === "short") return "bg-amber-100 text-amber-900 ring-amber-200";
  if (st === "surplus") return "bg-red-100 text-red-800 ring-red-200";
  return "bg-slate-200 text-slate-800 ring-slate-300";
}
