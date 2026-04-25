import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useOperationHistory } from "@/hooks/useWmsMock";
import { EXCEL_TABLE_BASE, EXCEL_TABLE_WRAP, STATIC_HEADER_BASE, excelRowBg } from "@/lib/excelTableStyles";

const HistoryOperationsPage = () => {
  const { data, isLoading, error } = useOperationHistory();
  const { legalEntityId } = useAppFilters();

  const rows = (data ?? []).filter((x) => legalEntityId === "all" || x.legalEntityId === legalEntityId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">История операций</h2>
        <p className="mt-1 text-sm text-slate-600">Журнал действий по складским операциям и документам.</p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Операционный журнал</CardTitle>
          <CardDescription>Все события по выбранному юрлицу и периоду.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">Не удалось загрузить историю операций.</p>
          ) : (
            <div className={EXCEL_TABLE_WRAP}>
              <table className={EXCEL_TABLE_BASE}>
                <thead>
                  <tr>
                    <th className={`${STATIC_HEADER_BASE} min-w-[144px] whitespace-nowrap`}>Дата</th>
                    <th className={`${STATIC_HEADER_BASE} min-w-[120px] whitespace-nowrap`}>Сотрудник</th>
                    <th className={`${STATIC_HEADER_BASE} min-w-[130px] whitespace-nowrap`}>Действие</th>
                    <th className={`${STATIC_HEADER_BASE} min-w-[240px]`}>Товар / документ</th>
                    <th className={`${STATIC_HEADER_BASE} w-[96px] text-right tabular-nums`}>Кол-во</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ev, idx) => {
                    const rowBg = excelRowBg(idx, false);
                    const cell = `border-b border-r border-slate-200 px-1.5 py-0.5 align-middle text-[11px] ${rowBg}`;
                    return (
                      <tr key={ev.id}>
                        <td className={`${cell} whitespace-nowrap tabular-nums`}>{format(parseISO(ev.dateIso), "d MMM yyyy HH:mm", { locale: ru })}</td>
                        <td className={`${cell} whitespace-nowrap`}>{ev.actor}</td>
                        <td className={`${cell} whitespace-nowrap`}>{ev.action}</td>
                        <td className={`${cell}`}>{ev.productLabel}</td>
                        <td className={`${cell} text-right tabular-nums`}>{ev.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoryOperationsPage;
