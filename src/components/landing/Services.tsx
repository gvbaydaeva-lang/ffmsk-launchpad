import { Truck, PackageCheck, Warehouse, Send } from "lucide-react";

const services = [
  {
    icon: Truck,
    title: "Забор товара",
    desc: "Заберём с рынков «Садовод», «Южные ворота», от поставщиков и из ПВЗ по Москве и области.",
  },
  {
    icon: PackageCheck,
    title: "Складская обработка",
    desc: "Приёмка, проверка качества, маркировка «Честный знак», упаковка по требованиям маркетплейсов.",
  },
  {
    icon: Warehouse,
    title: "Хранение",
    desc: "Тёплый охраняемый склад 2000 м² с круглосуточным видеонаблюдением и системой WMS.",
  },
  {
    icon: Send,
    title: "Логистика",
    desc: "Ежедневная отгрузка на Коледино, Электросталь, Софьино, Жуковский и сортировочные центры.",
  },
];

const Services = () => {
  return (
    <section id="services" className="relative py-28 md:py-36">
      <div className="container">
        <div className="max-w-2xl mb-16 md:mb-20">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
            <span className="h-px w-8 bg-accent" /> Услуги
          </span>
          <h2 className="mt-5 font-display text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
            Полный цикл фулфилмента <br />
            <span className="text-muted-foreground">под ключ</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            От забора товара у поставщика до отгрузки на склад маркетплейса. Вы занимаетесь продажами — мы всем остальным.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((s, i) => (
            <article
              key={s.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 transition-all duration-500 hover:-translate-y-1 hover:border-accent/40 hover:shadow-elegant"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                <s.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold text-foreground">{s.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0">
                Подробнее →
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
