import * as React from "react";
import { CartesianGrid, Line, LineChart, Pie, PieChart, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useShipmentTrend, useMarketplaceOrdersShare } from "@/hooks/useDashboardAnalytics";
import { MARKETPLACE_CHART_COLORS, MARKETPLACE_LABELS } from "@/lib/marketplace";
import type { ShipmentTrendPeriod } from "@/types/domain";
import { Badge } from "@/components/ui/badge";

const lineChartConfig = {
  wb: { label: MARKETPLACE_LABELS.wb, color: MARKETPLACE_CHART_COLORS.wb },
  ozon: { label: MARKETPLACE_LABELS.ozon, color: MARKETPLACE_CHART_COLORS.ozon },
  yandex: { label: MARKETPLACE_LABELS.yandex, color: MARKETPLACE_CHART_COLORS.yandex },
} satisfies ChartConfig;

const pieChartConfig = {
  wb: { label: MARKETPLACE_LABELS.wb, color: MARKETPLACE_CHART_COLORS.wb },
  ozon: { label: MARKETPLACE_LABELS.ozon, color: MARKETPLACE_CHART_COLORS.ozon },
  yandex: { label: MARKETPLACE_LABELS.yandex, color: MARKETPLACE_CHART_COLORS.yandex },
} satisfies ChartConfig;

const DashboardPage = () => {
  const [period, setPeriod] = React.useState<ShipmentTrendPeriod>("week");
  const trend = useShipmentTrend(period);
  const share = useMarketplaceOrdersShare();

  const pieRows = React.useMemo(() => {
    if (!share.data) return [];
    return share.data.map((row) => ({
      ...row,
      fill: `var(--color-${row.marketplace})`,
    }));
  }, [share.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Обзор</h2>
          <p className="mt-1 text-sm text-muted-foreground">Демо-данные по трём маркетплейсам до подключения API.</p>
        </div>
        <Badge variant="secondary" className="w-fit shrink-0">
          Mock-данные
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="border-border/80 shadow-elegant xl:col-span-2">
          <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="font-display text-lg tracking-tight">Отчёт по отгрузкам</CardTitle>
              <CardDescription>Суммарные отгрузки по Wildberries, Ozon и Яндекс.Маркет</CardDescription>
            </div>
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={(v) => {
                if (v === "week" || v === "month") setPeriod(v);
              }}
              variant="outline"
              size="sm"
              className="shrink-0 self-start rounded-lg bg-muted/40 p-0.5"
            >
              <ToggleGroupItem value="week" aria-label="Неделя" className="rounded-md px-3 text-xs sm:text-sm">
                Неделя
              </ToggleGroupItem>
              <ToggleGroupItem value="month" aria-label="Месяц" className="rounded-md px-3 text-xs sm:text-sm">
                Месяц
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent className="pt-0">
            {trend.isLoading ? (
              <Skeleton className="h-[min(280px,55vw)] w-full rounded-lg" />
            ) : trend.error ? (
              <p className="text-sm text-destructive">Не удалось загрузить график. Попробуйте обновить страницу.</p>
            ) : (
              <ChartContainer
                config={lineChartConfig}
                className="aspect-auto h-[min(280px,52vw)] w-full min-h-[220px] max-h-[320px] sm:h-[300px] sm:max-h-none"
              >
                <LineChart accessibilityLayer data={trend.data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={period === "month" ? 5 : 0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={40}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="wb" stroke="var(--color-wb)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ozon" stroke="var(--color-ozon)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="yandex" stroke="var(--color-yandex)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-elegant">
          <CardHeader>
            <CardTitle className="font-display text-lg tracking-tight">Заказы по площадкам</CardTitle>
            <CardDescription>Распределение количества заказов</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-0">
            {share.isLoading ? (
              <Skeleton className="mx-auto aspect-square w-full max-w-[280px] rounded-full" />
            ) : share.error ? (
              <p className="text-sm text-destructive">Ошибка загрузки диаграммы.</p>
            ) : (
              <ChartContainer config={pieChartConfig} className="mx-auto aspect-square w-full max-w-[280px] min-h-[220px]">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={pieRows}
                    dataKey="orders"
                    nameKey="marketplace"
                    innerRadius={48}
                    outerRadius={88}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {pieRows.map((row) => (
                      <Cell key={row.marketplace} fill={row.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="marketplace" />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
