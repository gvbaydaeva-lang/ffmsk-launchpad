import { ShieldCheck, Camera, Monitor, Clock, Banknote, BadgeCheck } from "lucide-react";

const benefits = [
  {
    icon: Monitor,
    title: "Личный кабинет",
    desc: "Онлайн-доступ к остаткам, отгрузкам и статистике в реальном времени.",
  },
  {
    icon: Camera,
    title: "Фотоотчёты 24/7",
    desc: "Фото и видео любого этапа обработки по запросу за 15 минут.",
  },
  {
    icon: ShieldCheck,
    title: "Материальная ответственность",
    desc: "Договор с полной компенсацией стоимости товара при утере или порче.",
  },
  {
    icon: Clock,
    title: "Обработка за 24 часа",
    desc: "Гарантия отгрузки в день поступления при заявке до 14:00.",
  },
  {
    icon: Banknote,
    title: "Без предоплаты",
    desc: "Постоплата по факту выполненных работ для проверенных клиентов.",
  },
  {
    icon: BadgeCheck,
    title: "Официальный договор",
    desc: "Работаем с ИП, ООО и самозанятыми. Закрывающие документы каждый месяц.",
  },
];

const Trust = () => {
  return (
    <section className="relative py-28 md:py-36">
      <div className="container">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-28">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
              <span className="h-px w-8 bg-accent" /> Преимущества
            </span>
            <h2 className="mt-5 font-display text-4xl md:text-5xl font-semibold tracking-tight text-foreground leading-[1.05]">
              Почему селлеры <br />
              выбирают <span className="text-accent">FF·MSK</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Мы не просто склад — мы технологичный партнёр, который берёт на себя всю операционку, чтобы вы росли быстрее.
            </p>
          </div>

          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="group relative bg-background p-7 md:p-8 transition-colors hover:bg-secondary/60"
              >
                <b.icon className="h-6 w-6 text-accent transition-transform group-hover:scale-110" strokeWidth={1.5} />
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Trust;
