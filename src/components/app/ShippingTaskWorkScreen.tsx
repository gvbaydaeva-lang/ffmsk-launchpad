import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/app/StatusBadge";
import TaskItemsTable, { type TaskItemRow } from "@/components/app/TaskItemsTable";
import type { TaskWorkflowStatus } from "@/types/domain";

type Props = {
  assignmentNo: string;
  legalEntityName: string;
  warehouseName: string;
  createdAt: string;
  status: TaskWorkflowStatus;
  plan: number;
  fact: number;
  rows: TaskItemRow[];
  onBack: () => void;
};

export default function ShippingTaskWorkScreen({
  assignmentNo,
  legalEntityName,
  warehouseName,
  createdAt,
  status,
  plan,
  fact,
  rows,
  onBack,
}: Props) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Рабочий экран отгрузки</CardTitle>
        <CardDescription>Просмотр состава и прогресса выбранного задания</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-5">
          <div><span className="text-slate-500">№ задания:</span><div className="font-medium text-slate-900">{assignmentNo || "—"}</div></div>
          <div><span className="text-slate-500">Юрлицо:</span><div className="font-medium text-slate-900">{legalEntityName || "—"}</div></div>
          <div><span className="text-slate-500">Склад:</span><div className="font-medium text-slate-900">{warehouseName || "—"}</div></div>
          <div><span className="text-slate-500">Статус:</span><div className="mt-0.5"><StatusBadge status={status} /></div></div>
          <div>
            <span className="text-slate-500">Дата:</span>
            <div className="font-medium text-slate-900">
              {createdAt ? format(parseISO(createdAt), "dd.MM.yyyy HH:mm", { locale: ru }) : "—"}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900">
          План {plan} · Факт {fact} · Осталось {Math.max(0, plan - fact)}
        </div>

        <TaskItemsTable rows={rows} />

        <Button type="button" variant="outline" className="h-10 w-full max-w-sm" onClick={onBack}>
          Назад к списку
        </Button>
      </CardContent>
    </Card>
  );
}
