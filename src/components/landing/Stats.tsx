import { Package, Warehouse, ShieldCheck, Clock } from "lucide-react";
import boxWB from "@/assets/box-wb.png";
import boxOzon from "@/assets/box-ozon.png";

const stats = [
  {
    icon: Package,
    value: "5 000+",
    label: "заказов в день",
    sub: "Стабильный объём отгрузок",
  },
  {
    icon: Warehouse,
    value: "2 000",
    unit: "м²",
    label: "площадь склада",
    sub: "Класс A в Москве",
  },
  {
    icon: ShieldCheck,
    value: "99",
    unit: "%",
    label: "без брака",
    sub: "Контроль качества на каждом этапе",
  },
  {
    icon: Clock,
    value: "24",
    unit: "ч",
    label: "время отгрузки",
    sub: "От поставки до отгрузки",
  },
];

const Stats = () => {
  return (
    <section
      id="stats"
      className="relative bg-background py-24 md:py-32 overflow-hidden"
    >
      <div className="container">
        <div className="max-w-2xl">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Цифры
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight">
            Тысячи отправлений.
            <br />
            <span className="text-muted-foreground">Ноль компромиссов.</span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-border/70 shadow-none">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="group relative bg-card p-8 md:p-10 transition-colors duration-500 hover:bg-secondary/60"
              >
                <Icon
                  className="h-6 w-6 text-accent transition-transform duration-500 group-hover:scale-110"
                  strokeWidth={1.6}
                />
                <div className="mt-8 flex items-baseline gap-1">
                  <span className="font-display text-5xl md:text-6xl font-semibold tracking-tight text-foreground">
                    {s.value}
                  </span>
                  {s.unit && (
                    <span className="font-display text-2xl md:text-3xl font-medium text-accent">
                      {s.unit}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm font-medium text-foreground">
                  {s.label}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {s.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Stats;
