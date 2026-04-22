import * as React from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useFinanceOperations, useLegalEntities } from "@/hooks/useWmsMock";
import { cn } from "@/lib/utils";

const FinancePage = () => {
  const { data, isLoading, error } = useFinanceOperations();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    if (!data) return [];
    if (legalEntityId === "all") return data;
    return data.filter((op) => op.legalEntityId === legalEntityId);
  }, [data, legalEntityId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Биллинг</h2>
        <p className="mt-1 text-sm text-slate-600">
          Начисления за услуги FF, оплаты от клиентов. Маркетплейс — направление отгрузки.
        </p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Журнал операций</CardTitle>
          <CardDescription className="text-slate-500">Услуги склада и взаиморасчёты с клиентами</CardDescription>
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
                  <TableHead className="text-slate-600">Дата</TableHead>
                  <TableHead className="text-slate-600">Юрлицо</TableHead>
                  <TableHead className="text-slate-600">Тип</TableHead>
                  <TableHead className="text-slate-600">Направление</TableHead>
                  <TableHead className="text-right text-slate-600">Сумма, ₽</TableHead>
                  <TableHead className="min-w-[180px] text-slate-600">Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((op) => (
                  <TableRow key={op.id} className="border-slate-100">
                    <TableCell className="whitespace-nowrap text-slate-500 text-xs sm:text-sm">
                      {format(parseISO(op.date), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800 text-sm">{entityName(op.legalEntityId)}</TableCell>
                    <TableCell className="text-slate-900">{op.kind}</TableCell>
                    <TableCell>
                      {op.marketplace ? (
                        <MarketplaceBadge marketplace={op.marketplace} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums text-sm",
                        op.amountRub < 0 ? "text-destructive" : "text-slate-900",
                      )}
                    >
                      {op.amountRub.toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-slate-600 text-xs sm:text-sm">{op.comment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancePage;
