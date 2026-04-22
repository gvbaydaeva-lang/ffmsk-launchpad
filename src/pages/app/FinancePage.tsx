import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale/ru";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MarketplaceBadge from "@/components/wms/MarketplaceBadge";
import { useFinanceOperations } from "@/hooks/useWmsMock";
import { cn } from "@/lib/utils";

const FinancePage = () => {
  const { data, isLoading, error } = useFinanceOperations();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Финансы</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Начисления за услуги FF, оплаты от клиентов. Маркетплейс — только направление отгрузки, не продажи.
        </p>
      </div>

      <Card className="border-border/80 shadow-elegant">
        <CardHeader>
          <CardTitle className="font-display text-lg">Журнал операций</CardTitle>
          <CardDescription>Услуги склада и взаиморасчёты с клиентами</CardDescription>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Направление</TableHead>
                    <TableHead className="text-right">Сумма, ₽</TableHead>
                    <TableHead className="min-w-[180px]">Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs sm:text-sm">
                        {format(parseISO(op.date), "d MMM yyyy", { locale: ru })}
                      </TableCell>
                      <TableCell>{op.kind}</TableCell>
                      <TableCell>
                        {op.marketplace ? (
                          <MarketplaceBadge marketplace={op.marketplace} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums text-sm",
                          op.amountRub < 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {op.amountRub.toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="max-w-[240px] text-muted-foreground text-xs sm:text-sm">{op.comment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancePage;
