import { Phone, Mail, MapPin, Send, MessageCircle, Instagram } from "lucide-react";

const navGroups = [
  {
    title: "Услуги",
    links: [
      { label: "Забор товара", href: "#services" },
      { label: "Маркировка", href: "#services" },
      { label: "Хранение", href: "#services" },
      { label: "Логистика", href: "#services" },
    ],
  },
  {
    title: "Компания",
    links: [
      { label: "О нас", href: "#stats" },
      { label: "Тарифы", href: "#pricing" },
      { label: "Контакты", href: "#contact" },
      { label: "Договор-оферта", href: "#" },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="relative bg-primary text-primary-foreground pt-20 pb-10">
      <div className="container">
        <div className="grid lg:grid-cols-12 gap-12 pb-16 border-b border-white/10">
          <div className="lg:col-span-5">
            <a href="#" className="inline-flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gradient shadow-glow">
                <span className="font-display text-sm font-bold text-accent-foreground">F</span>
              </span>
              <span className="font-display text-xl font-semibold tracking-tight">
                Full-24Msk
              </span>
            </a>
            <p className="mt-5 text-sm text-primary-foreground/60 max-w-sm leading-relaxed">
              Фулфилмент-оператор полного цикла для селлеров Wildberries, Ozon и Яндекс.Маркета. Москва, с 2019 года.
            </p>

            <div className="mt-7 flex items-center gap-3">
              {[
                { icon: Send, href: "#", label: "Telegram" },
                { icon: MessageCircle, href: "#", label: "WhatsApp" },
                { icon: Instagram, href: "#", label: "Instagram" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-accent hover:border-accent transition-colors"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {navGroups.map((g) => (
            <div key={g.title} className="lg:col-span-2">
              <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-primary-foreground/90">
                {g.title}
              </h4>
              <ul className="mt-5 space-y-3">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-primary-foreground/60 hover:text-accent-glow transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-3">
            <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-primary-foreground/90">
              Контакты
            </h4>
            <ul className="mt-5 space-y-4 text-sm">
              <li className="flex items-start gap-3 text-primary-foreground/70">
                <Phone className="h-4 w-4 mt-0.5 text-accent-glow shrink-0" />
                <a href="tel:+74951234567" className="hover:text-primary-foreground transition-colors">
                  +7 (495) 123-45-67
                </a>
              </li>
              <li className="flex items-start gap-3 text-primary-foreground/70">
                <Mail className="h-4 w-4 mt-0.5 text-accent-glow shrink-0" />
                <a href="mailto:hello@Full-24Msk.ru" className="hover:text-primary-foreground transition-colors">
                  hello@Full-24Msk.ru
                </a>
              </li>
              <li className="flex items-start gap-3 text-primary-foreground/70">
                <MapPin className="h-4 w-4 mt-0.5 text-accent-glow shrink-0" />
                <span>г. Москва, МКАД 24 км, стр. 1<br />Пн–Сб: 9:00 – 21:00</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 rounded-2xl overflow-hidden border border-white/10 h-64">
          <iframe
            title="Карта склада Full-24Msk"
            src="https://yandex.ru/map-widget/v1/?ll=37.617635%2C55.755814&z=10&pt=37.617635,55.755814,pm2rdm"
            width="100%"
            height="100%"
            frameBorder="0"
            loading="lazy"
            className="grayscale contrast-125 opacity-80"
          />
        </div>

        <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-primary-foreground/40">
          <span>© {new Date().getFullYear()} Full-24Msk. Все права защищены.</span>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-primary-foreground transition-colors">Политика конфиденциальности</a>
            <a href="#" className="hover:text-primary-foreground transition-colors">Реквизиты</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
