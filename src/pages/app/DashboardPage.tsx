import { Link } from "react-router-dom";
import {
  ArrowRight,
  Box,
  Building2,
  Coins,
  Gauge,
  Layers,
  PackageOpen,
  Truck,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useFfDashboardSnapshot } from "@/hooks/useDashboardAnalytics";

const DashboardPage = () => {
  const { data, isLoading, error } = useFfDashboardSnapshot();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Операции FF</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Складская логистика и услуги фулфилмента. Без аналитики продаж и кабинета селлера.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0 border-accent/40 text-accent">
          Демо-данные
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/receiving" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-border/80 shadow-elegant transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <PackageOpen className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-base">Приёмка</CardTitle>
              <CardDescription>Входящие поставки</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-1 text-sm font-medium text-accent">
              Открыть
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/shipping" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-border/80 shadow-elegant transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Box className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-base">Отгрузка</CardTitle>
              <CardDescription>Коробы / паллеты на маршрут</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-1 text-sm font-medium text-accent">
              Открыть
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/warehouse" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-border/80 shadow-elegant transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Layers className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-base">Склад</CardTitle>
              <CardDescription>FIFO и остатки</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-1 text-sm font-medium text-accent">
              Открыть
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/finance" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full border-border/80 shadow-elegant transition-colors hover:bg-secondary/50">
            <CardHeader className="pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Wallet className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-base">Финансы FF</CardTitle>
              <CardDescription>Услуги и дебиторка</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-1 text-sm font-medium text-accent">
              Открыть
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Не удалось загрузить сводку.</p>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80 shadow-elegant">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Операционная загрузка</CardTitle>
                <CardDescription>Приёмки и исходящая отгрузка на сегодня</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Приёмки в обработке</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{data.receivingsInProcessing}</p>
                <p className="mt-1 text-xs text-muted-foreground">Статусы «в обработке» и «частично»</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">К отгрузке сегодня</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                  {data.boxesPendingShipmentToday}
                  <span className="text-lg font-normal text-muted-foreground"> коробов</span>
                </p>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-muted-foreground">
                  {data.palletsPendingShipmentToday}{" "}
                  <span className="text-base font-normal">паллет</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-elegant">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Складская мощность</CardTitle>
                <CardDescription>Заполненность стеллажей</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-4xl font-semibold tabular-nums">{data.rackOccupancyPercent}%</span>
                <span className="text-sm text-muted-foreground">занято</span>
              </div>
              <Progress value={data.rackOccupancyPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">Плановая вместимость зоны хранения; не продажи.</p>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-elegant">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Финансы фулфилмента</CardTitle>
                <CardDescription>Дебиторка и оборот по услугам (не товары)</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Дебиторская задолженность</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {data.clientsReceivablesRub.toLocaleString("ru-RU")} ₽
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Клиенты должны нам</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Оборот услуг (месяц)</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-accent">
                  {data.servicesRevenueMonthRub.toLocaleString("ru-RU")} ₽
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Хранение, упаковка, логистика FF</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-elegant">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Клиентская база</CardTitle>
                <CardDescription>Юрлица на обслуживании</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-display text-4xl font-semibold tabular-nums">{data.activeLegalEntitiesCount}</p>
                <p className="text-sm text-muted-foreground">активных организаций</p>
              </div>
              <Link
                to="/legal-entities"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Карточки юрлиц
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardPage;
