import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import boxYM from "@/assets/box-ym.png";
import boxOzon from "@/assets/box-ozon.png";

const plans = [
  {
    name: "Лёгкий старт",
    price: "от 15 ₽",
    unit: "за единицу",
    desc: "Для новых селлеров до 500 заказов в месяц",
    features: [
      "Приёмка и хранение",
      "Базовая упаковка",
      "Маркировка ШК",
      "Отгрузка 2 раза в неделю",
      "Email-отчёты",
    ],
    cta: "Начать",
    featured: false,
  },
  {
    name: "Масштабирование",
    price: "от 11 ₽",
    unit: "за единицу",
    desc: "Для растущих брендов от 500 до 5000 заказов",
    features: [
      "Всё из «Лёгкий старт»",
      "Личный менеджер",
      "Фотоотчёты по запросу",
      "Ежедневная отгрузка",
      "Маркировка «Честный знак»",
      "Возвраты и обработка брака",
    ],
    cta: "Выбрать тариф",
    featured: true,
  },
  {
    name: "Индивидуальный",
    price: "Договорная",
    unit: "по запросу",
    desc: "Для крупных селлеров от 5000 заказов",
    features: [
      "Всё из «Масштабирование»",
      "Выделенная зона на складе",
      "Кастомная упаковка и вкладыши",
      "API-интеграция",
      "Материальная ответственность",
      "SLA по KPI",
    ],
    cta: "Обсудить",
    featured: false,
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="relative py-28 md:py-36 bg-secondary/40 overflow-hidden">
      {/* Floating marketplace boxes */}
      <img
        src={boxYM}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1024}
        height={1024}
        className="pointer-events-none absolute -left-16 top-20 hidden lg:block w-48 xl:w-56 opacity-70 animate-float -rotate-12 drop-shadow-[0_25px_50px_hsl(25_35%_18%/0.18)]"
      />
      <img
        src={boxOzon}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1024}
        height={1024}
        className="pointer-events-none absolute -right-12 bottom-24 hidden lg:block w-44 xl:w-52 opacity-70 animate-float rotate-6 drop-shadow-[0_25px_50px_hsl(25_35%_18%/0.18)]"
        style={{ animationDelay: "2.5s" }}
      />

      <div className="container relative">
        <div className="max-w-2xl mx-auto text-center mb-16 md:mb-20">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
            <span className="h-px w-8 bg-accent" /> Тарифы <span className="h-px w-8 bg-accent" />
          </span>
          <h2 className="mt-5 font-display text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
            Прозрачные цены <br />
            <span className="text-muted-foreground">без скрытых платежей</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Платите только за то, что используете. Никаких абонентских плат.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-3xl p-8 md:p-10 transition-all duration-500",
                plan.featured
                  ? "bg-primary text-primary-foreground shadow-glow lg:scale-[1.04] border border-accent/30"
                  : "bg-card border border-border hover:border-accent/30 hover:-translate-y-1"
              )}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-accent-gradient px-4 py-1.5 text-xs font-semibold text-accent-foreground shadow-glow">
                  <Sparkles className="h-3 w-3" /> Популярный
                </div>
              )}

              <h3 className={cn("font-display text-2xl font-semibold", plan.featured ? "text-primary-foreground" : "text-foreground")}>
                {plan.name}
              </h3>
              <p className={cn("mt-2 text-sm", plan.featured ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {plan.desc}
              </p>

              <div className="mt-7 flex items-baseline gap-2">
                <span className={cn("font-display text-4xl md:text-5xl font-semibold tracking-tight", plan.featured ? "text-primary-foreground" : "text-foreground")}>
                  {plan.price}
                </span>
                <span className={cn("text-sm", plan.featured ? "text-primary-foreground/60" : "text-muted-foreground")}>
                  {plan.unit}
                </span>
              </div>

              <Button
                variant={plan.featured ? "hero" : "outline"}
                size="lg"
                className="w-full mt-8"
                asChild
              >
                <a href="#contact">{plan.cta}</a>
              </Button>

              <ul className="mt-8 space-y-3.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <span className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      plan.featured ? "bg-accent/20 text-accent-glow" : "bg-accent/10 text-accent"
                    )}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className={plan.featured ? "text-primary-foreground/85" : "text-foreground/80"}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
