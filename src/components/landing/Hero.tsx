import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-warehouse.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen overflow-hidden bg-hero text-white pt-28 pb-20">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroImg}
          alt="Современный фулфилмент-склад FF-MSK в Москве"
          width={1920}
          height={1080}
          className="h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[hsl(222_47%_6%/0.7)] to-[hsl(222_47%_6%)]" />
        <div className="absolute inset-0 grid-pattern opacity-40" />
      </div>

      {/* Glow blobs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-accent/30 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/20 blur-[120px]" />

      <div className="container relative z-10 flex flex-col items-center text-center">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-white/80 animate-fade-in"
          style={{ animationDelay: "0.05s", opacity: 0 }}
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Фулфилмент №1 для маркетплейсов
        </div>

        <h1
          className="mt-8 max-w-5xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] text-gradient animate-fade-up"
          style={{ animationDelay: "0.15s", opacity: 0 }}
        >
          Ваш склад в Москве —{" "}
          <span className="block sm:inline">наша ответственность.</span>
        </h1>

        <p
          className="mt-6 max-w-2xl text-base sm:text-lg md:text-xl text-white/65 leading-relaxed animate-fade-up"
          style={{ animationDelay: "0.3s", opacity: 0 }}
        >
          Обработка товара от{" "}
          <span className="text-white font-medium">24 часов</span> для Wildberries,
          Ozon и Яндекс.Маркета. Без брака. Без задержек. Без головной боли.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 animate-fade-up"
          style={{ animationDelay: "0.45s", opacity: 0 }}
        >
          <Button variant="hero" size="xl" className="group">
            Получить расчёт
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
          <Button variant="glass" size="xl">
            Посмотреть склад
          </Button>
        </div>

        <div
          className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs sm:text-sm text-white/50 animate-fade-in"
          style={{ animationDelay: "0.7s", opacity: 0 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Работаем без выходных
          </div>
          <div className="hidden sm:block h-3 w-px bg-white/20" />
          <div>Договор за 1 день</div>
          <div className="hidden sm:block h-3 w-px bg-white/20" />
          <div>Страхование товара</div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
