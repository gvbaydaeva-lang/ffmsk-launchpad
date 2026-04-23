import * as React from "react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useFinanceOperations, useLegalEntities, useOperationHistory } from "@/hooks/useWmsMock";
import { exportFinanceClientReport } from "@/lib/financeExport";

type FinanceSummaryRow = {
  legalEntityId: string;
  legalEntityName: string;
  storageAccruedRub: number;
  serviceAccruedRub: number;
  totalDueRub: number;
  paymentStatus: string;
};

const FinancePage = () => {
  const { data, isLoading, error } = useFinanceOperations();
  const { data: entities } = useLegalEntities();
  const { data: history } = useOperationHistory();
  const { legalEntityId, dateFrom, dateTo } = useAppFilters();

  const periodLabel = `${format(dateFrom, "d MMM yyyy", { locale: ru })} — ${format(dateTo, "d MMM yyyy", { locale: ru })}`;

  const filteredOps = React.useMemo(() => {
    if (!data) return [];
    return data.filter((op) => {
      const opDate = parseISO(op.date.includes("T") ? op.date : `${op.date}T00:00:00`);
      const byDate = isWithinInterval(opDate, { start: dateFrom, end: dateTo });
      const byEntity = legalEntityId === "all" || op.legalEntityId === legalEntityId;
      return byDate && byEntity;
    });
  }, [data, legalEntityId, dateFrom, dateTo]);

  const summaryRows = React.useMemo<FinanceSummaryRow[]>(() => {
    if (!entities?.length) return [];
    const map: Record<string, FinanceSummaryRow> = {};
    for (const e of entities) {
      if (legalEntityId !== "all" && e.id !== legalEntityId) continue;
      map[e.id] = {
        legalEntityId: e.id,
        legalEntityName: e.shortName,
        storageAccruedRub: 0,
        serviceAccruedRub: 0,
        totalDueRub: 0,
        paymentStatus: "Нет начислений",
      };
    }
    for (const op of filteredOps) {
      const row = map[op.legalEntityId];
      if (!row) continue;
      if (op.kind === "хранение") row.storageAccruedRub += op.amountRub;
      else if (op.kind === "оплата от клиента") row.totalDueRub -= op.amountRub;
      else row.serviceAccruedRub += op.amountRub;
    }
    return Object.values(map).map((row) => {
      const charges = row.storageAccruedRub + row.serviceAccruedRub;
      const due = Math.max(0, charges + row.totalDueRub);
      let status = "К оплате";
      if (charges === 0) status = "Нет начислений";
      else if (due === 0) status = "Оплачено";
      return { ...row, totalDueRub: due, paymentStatus: status };
    });
  }, [entities, filteredOps, legalEntityId]);

  const historyRows = React.useMemo(() => {
    const rows = history ?? [];
    return rows.filter((ev) => {
      const d = parseISO(ev.dateIso);
      const byDate = isWithinInterval(d, { start: dateFrom, end: dateTo });
      const byEntity = legalEntityId === "all" || ev.legalEntityId === legalEntityId || ev.legalEntityId === "all";
      return byDate && byEntity;
    });
  }, [history, dateFrom, dateTo, legalEntityId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Биллинг</h2>
        <p className="mt-1 text-sm text-slate-600">
          Сводка начислений по юрлицам: хранение, услуги и статус оплаты.
        </p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Финансы по юрлицам</CardTitle>
          <CardDescription className="text-slate-500">Период: {periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить операции.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-right text-slate-600">Начислено за хранение</TableHead>
                  <TableHead className="text-right text-slate-600">Услуги (приёмка/упаковка)</TableHead>
                  <TableHead className="text-right text-slate-600">Итого к оплате</TableHead>
                  <TableHead className="text-slate-600">Статус оплаты</TableHead>
                  <TableHead className="text-slate-600">Отчёт</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.legalEntityId} className="border-slate-100">
                    <TableCell className="max-w-[240px] truncate text-slate-800 text-sm">{row.legalEntityName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.storageAccruedRub.toLocaleString("ru-RU")} ₽</TableCell>
                    <TableCell className="text-right tabular-nums">{row.serviceAccruedRub.toLocaleString("ru-RU")} ₽</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-900">
                      {row.totalDueRub.toLocaleString("ru-RU")} ₽
                    </TableCell>
                    <TableCell>{row.paymentStatus}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() =>
                          exportFinanceClientReport({
                            legalEntityName: row.legalEntityName,
                            storageAccruedRub: row.storageAccruedRub,
                            serviceAccruedRub: row.serviceAccruedRub,
                            totalDueRub: row.totalDueRub,
                            paymentStatus: row.paymentStatus,
                            periodLabel,
                          })
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        Выгрузить CSV
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">История операций</CardTitle>
          <CardDescription className="text-slate-500">Кто, когда и какой товар привёз или отгрузил</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead>Дата</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Товар / документ</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead>Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyRows.map((ev) => (
                <TableRow key={ev.id} className="border-slate-100">
                  <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                    {format(parseISO(ev.dateIso), "d MMM yyyy HH:mm", { locale: ru })}
                  </TableCell>
                  <TableCell>{ev.actor}</TableCell>
                  <TableCell>{ev.action}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{ev.productLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{ev.quantity.toLocaleString("ru-RU")}</TableCell>
                  <TableCell className="max-w-[260px] text-slate-600 text-xs sm:text-sm">{ev.comment}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancePage;
