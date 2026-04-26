import { planFactOverrun, planFactRemaining } from "@/lib/planFactDiscrepancy";

/** Строка задания с планом и фактом (validation-слой, без привязки к доменным типам). */
export type PlanFactLineInput = {
  plannedQty: number;
  factQty: number;
};

export type LineValidationStatus = "ok" | "warning" | "error";

export type LineValidationResult = {
  status: LineValidationStatus;
  label: string;
  message: string;
  remainingQty: number;
  overQty: number;
};

export type TaskValidationResult = {
  hasWarnings: boolean;
  hasErrors: boolean;
  totalRemaining: number;
  totalOver: number;
  canCompleteExact: boolean;
};

function normPlanFact(item: PlanFactLineInput): { plan: number; fact: number } {
  return {
    plan: Math.trunc(Number(item.plannedQty) || 0),
    fact: Math.trunc(Number(item.factQty) || 0),
  };
}

/**
 * Проверка одной строки план/факт (подготовка к единому validation-слою WMS).
 */
export function getLineValidation(item: PlanFactLineInput): LineValidationResult {
  const { plan, fact } = normPlanFact(item);

  if (fact === plan) {
    return {
      status: "ok",
      label: "Ок",
      message: "План выполнен",
      remainingQty: 0,
      overQty: 0,
    };
  }

  if (fact < plan) {
    const remainingQty = planFactRemaining(plan, fact);
    return {
      status: "warning",
      label: "Не хватает",
      message: `Не хватает ${remainingQty} шт`,
      remainingQty,
      overQty: 0,
    };
  }

  const overQty = planFactOverrun(plan, fact);
  return {
    status: "error",
    label: "Ошибка",
    message: `Перерасход ${overQty} шт`,
    remainingQty: 0,
    overQty,
  };
}

/**
 * Сводка по набору строк план/факт.
 */
export function getTaskValidation(items: PlanFactLineInput[]): TaskValidationResult {
  const lines = items.map((it) => getLineValidation(it));
  const hasWarnings = lines.some((l) => l.status === "warning");
  const hasErrors = lines.some((l) => l.status === "error");
  const totalRemaining = lines.reduce((s, l) => s + l.remainingQty, 0);
  const totalOver = lines.reduce((s, l) => s + l.overQty, 0);
  const canCompleteExact = items.every((it) => {
    const { plan, fact } = normPlanFact(it);
    return fact === plan;
  });

  return { hasWarnings, hasErrors, totalRemaining, totalOver, canCompleteExact };
}

/** Текст предупреждения рядом с кнопкой «Завершить» при расхождении План/Факт. */
export function buildPlanFactCompleteWarning(validation: TaskValidationResult): string | null {
  if (validation.totalRemaining <= 0 && validation.totalOver <= 0) return null;
  if (validation.totalRemaining > 0 && validation.totalOver <= 0) {
    return `Есть расхождения План/Факт. Не хватает ${validation.totalRemaining} шт.`;
  }
  if (validation.totalRemaining <= 0 && validation.totalOver > 0) {
    return `Есть расхождения План/Факт. Перерасход ${validation.totalOver} шт.`;
  }
  return `Есть расхождения План/Факт. Не хватает ${validation.totalRemaining} шт, перерасход ${validation.totalOver} шт.`;
}

/** Описание для журнала операций (type: TASK_MISMATCH). */
export function buildPlanFactMismatchLogDescription(taskNo: string, validation: TaskValidationResult): string | null {
  if (validation.totalRemaining <= 0 && validation.totalOver <= 0) return null;
  const parts: string[] = [];
  if (validation.totalRemaining > 0) parts.push(`не хватает ${validation.totalRemaining} шт`);
  if (validation.totalOver > 0) parts.push(`перерасход ${validation.totalOver} шт`);
  return `Расхождение План/Факт в задании №${taskNo}: ${parts.join(", ")}`;
}
