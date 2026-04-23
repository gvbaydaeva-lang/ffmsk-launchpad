import * as React from "react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useFinanceOperations, useLegalEntities } from "@/hooks/useWmsMock";
import { exportFinanceClientReport } from "@/lib/financeExport";
import type { FinanceOperation } from "@/types/domain";

type FinanceSummaryRow = {
  legalEntityId: string;
  legalEntityName: string;
  storageAccruedRub: number;
  serviceAccruedRub: number;
  chargesTotalRub: number;
  paidRub: number;
  totalDueRub: number;
  paymentStatus: string;
};

function buildAccrualBasis(op: FinanceOperation) {
  const date = format(parseISO(op.date.includes("T") ? op.date : `${op.date}T00:00:00`), "dd.MM", { locale: ru });
  if (op.kind === "хранение") {
    const units = /(\d+)\s*ед/.exec(op.comment)?.[1];
    return units ? `Хранение ${units} ед. товара за ${date}` : `Хранение по остаткам за ${date}`;
  }
  if (op.kind === "упаковка") return "Упаковка коробов / комплектов";
  if (op.kind === "начисление услуг") return "Комплекс услуг приёмки и обработки";
  if (op.kind === "логистика") return "Логистика и внутрискладские перемещения";
  return op.comment || "Операционное начисление";
}

const FinancePage = () => {
  const { data, isLoading, error } = useFinanceOperations();
  const { data: entities } = useLegalEntities();
  const { legalEntityId, dateFrom, dateTo } = useAppFilters();
  const [accrualFilter, setAccrualFilter] = React.useState<"all" | "storage" | "services">("all");

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
        chargesTotalRub: 0,
        paidRub: 0,
        totalDueRub: 0,
        paymentStatus: "Нет начислений",
      };
    }
    for (const op of filteredOps) {
      const row = map[op.legalEntityId];
      if (!row) continue;
      if (op.kind === "оплата от клиента") {
        row.paidRub += op.amountRub;
      } else if (op.kind === "хранение") {
        row.storageAccruedRub += op.amountRub;
      } else {
        row.serviceAccruedRub += op.amountRub;
      }
    }
    return Object.values(map).map((row) => {
      const charges = row.storageAccruedRub + row.serviceAccruedRub;
      const due = Math.max(0, charges - row.paidRub);
      let status = "К оплате";
      if (charges === 0) status = "Нет начислений";
      else if (due === 0) status = "Оплачено";
      else if (row.paidRub > 0) status = "Частично оплачено";
      return { ...row, chargesTotalRub: charges, totalDueRub: due, paymentStatus: status };
    });
  }, [entities, filteredOps, legalEntityId]);

  const debtRows = React.useMemo(
    () => summaryRows.filter((r) => r.totalDueRub > 0).sort((a, b) => b.totalDueRub - a.totalDueRub),
    [summaryRows],
  );

  const accrualHistoryRows = React.useMemo(() => {
    return filteredOps
      .filter((op) => op.kind !== "оплата от клиента")
      .filter((op) => {
        if (accrualFilter === "all") return true;
        if (accrualFilter === "storage") return op.kind === "хранение";
        return op.kind !== "хранение";
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filteredOps, accrualFilter]);

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
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg text-slate-900">Финансы по юрлицам</CardTitle>
          <CardDescription className="text-slate-500">Период: {periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-2 text-sm text-destructive">Не удалось загрузить операции.</p>
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-3 bg-slate-100">
                <TabsTrigger value="overview">Сводка</TabsTrigger>
                <TabsTrigger value="debt">Дебиторка</TabsTrigger>
                <TabsTrigger value="accruals">История начислений</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0">
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
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-semibold",
                            row.totalDueRub > 0 ? "text-red-600" : "text-emerald-600",
                          )}
                        >
                          {row.totalDueRub.toLocaleString("ru-RU")} ₽
                        </TableCell>
                        <TableCell
                          className={cn(
                            row.paymentStatus === "Оплачено" && "text-emerald-600",
                            row.paymentStatus === "К оплате" && "text-red-600",
                            row.paymentStatus === "Частично оплачено" && "text-amber-600",
                          )}
                        >
                          {row.paymentStatus}
                        </TableCell>
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
              </TabsContent>

              <TabsContent value="debt" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead>Юрлицо</TableHead>
                      <TableHead className="text-right">Начислено</TableHead>
                      <TableHead className="text-right">Оплачено</TableHead>
                      <TableHead className="text-right">Долг</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtRows.map((row) => (
                      <TableRow key={row.legalEntityId} className="border-slate-100">
                        <TableCell>{row.legalEntityName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.chargesTotalRub.toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">{row.paidRub.toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-red-600">
                          {row.totalDueRub.toLocaleString("ru-RU")} ₽
                        </TableCell>
                        <TableCell className="text-red-600">{row.paymentStatus}</TableCell>
                      </TableRow>
                    ))}
                    {debtRows.length === 0 && (
                      <TableRow className="border-slate-100">
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                          Должников за выбранный период нет.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="accruals" className="mt-0 space-y-3">
                <div className="flex w-full justify-end">
                  <Select value={accrualFilter} onValueChange={(v) => setAccrualFilter(v as "all" | "storage" | "services")}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Фильтр начислений" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все начисления</SelectItem>
                      <SelectItem value="storage">Только хранение</SelectItem>
                      <SelectItem value="services">Только услуги</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead>Дата</TableHead>
                      <TableHead>Юрлицо</TableHead>
                      <TableHead>Тип начисления</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead>Основание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accrualHistoryRows.map((op) => {
                      const entityName = entities?.find((e) => e.id === op.legalEntityId)?.shortName ?? op.legalEntityId;
                      return (
                        <TableRow key={op.id} className="border-slate-100">
                          <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                            {format(parseISO(op.date.includes("T") ? op.date : `${op.date}T00:00:00`), "d MMM yyyy", { locale: ru })}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">{entityName}</TableCell>
                          <TableCell>{op.kind}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{op.amountRub.toLocaleString("ru-RU")} ₽</TableCell>
                          <TableCell className="max-w-[320px] text-slate-600 text-xs sm:text-sm">{buildAccrualBasis(op)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {accrualHistoryRows.length === 0 && (
                      <TableRow className="border-slate-100">
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                          Нет начислений под выбранный фильтр.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancePage;
