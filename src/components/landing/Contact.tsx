import { useState } from "react";
import { z } from "zod";
import { ArrowRight, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const marketplaces = ["Wildberries", "Ozon", "Яндекс.Маркет", "Все сразу"];

const formSchema = z.object({
  name: z.string().trim().min(2, "Минимум 2 символа").max(100),
  phone: z
    .string()
    .trim()
    .min(10, "Введите корректный телефон")
    .max(20, "Слишком длинный номер")
    .regex(/^[\d\s+()\-]+$/, "Только цифры и +()-"),
  marketplace: z.string().min(1, "Выберите маркетплейс"),
});

const Contact = () => {
  const [form, setForm] = useState({ name: "", phone: "", marketplace: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        fieldErrors[i.path[0] as string] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setForm({ name: "", phone: "", marketplace: "" });
      toast({
        title: "Заявка отправлена",
        description: "Перезвоним в течение 15 минут в рабочее время.",
      });
    }, 800);
  };

  return (
    <section id="contact" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-hero" aria-hidden />
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden />

      <div className="container relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-6xl mx-auto">
          <div className="text-white">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent-glow">
              <span className="h-px w-8 bg-accent-glow" /> Связаться
            </span>
            <h2 className="mt-5 font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              Расскажите о вашем <br />
              <span className="text-gradient">бизнесе</span>
            </h2>
            <p className="mt-6 text-lg text-white/70 leading-relaxed max-w-md">
              Бесплатный расчёт стоимости фулфилмента под ваш товар. Перезвоним в течение 15 минут.
            </p>

            <div className="mt-10 space-y-5">
              <a href="tel:+74951234567" className="group flex items-center gap-4 text-white hover:text-accent-glow transition-colors">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/40 transition-colors">
                  <Phone className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/50">Телефон</div>
                  <div className="font-medium">+7 (495) 123-45-67</div>
                </div>
              </a>
              <a href="mailto:hello@Full-24Msk.ru" className="group flex items-center gap-4 text-white hover:text-accent-glow transition-colors">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/40 transition-colors">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/50">Email</div>
                  <div className="font-medium">hello@Full-24Msk.ru</div>
                </div>
              </a>
              <div className="flex items-center gap-4 text-white">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                  <MapPin className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/50">Адрес</div>
                  <div className="font-medium">г. Москва, МКАД 24 км, стр. 1</div>
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="relative rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 p-8 md:p-10 shadow-glow"
          >
            <h3 className="font-display text-2xl font-semibold text-white">Заявка на расчёт</h3>
            <p className="mt-2 text-sm text-white/60">Поля отмеченные * обязательны</p>

            <div className="mt-8 space-y-5">
              <div>
                <Label htmlFor="name" className="text-white/80 text-xs uppercase tracking-wider">Имя *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Александр"
                  maxLength={100}
                  className="mt-2 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-accent focus-visible:border-accent/50"
                />
                {errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}
              </div>

              <div>
                <Label htmlFor="phone" className="text-white/80 text-xs uppercase tracking-wider">Телефон *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 (___) ___-__-__"
                  maxLength={20}
                  className="mt-2 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-accent focus-visible:border-accent/50"
                />
                {errors.phone && <p className="mt-1.5 text-xs text-destructive">{errors.phone}</p>}
              </div>

              <div>
                <Label className="text-white/80 text-xs uppercase tracking-wider">Маркетплейс *</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {marketplaces.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, marketplace: m })}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-medium transition-all",
                        form.marketplace === m
                          ? "bg-accent text-accent-foreground border-accent shadow-glow"
                          : "bg-white/5 text-white/80 border-white/10 hover:border-white/30"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {errors.marketplace && <p className="mt-1.5 text-xs text-destructive">{errors.marketplace}</p>}
              </div>

              <Button type="submit" variant="hero" size="xl" className="w-full mt-2" disabled={loading}>
                {loading ? "Отправляем..." : "Получить расчёт"}
                <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-xs text-white/40 text-center leading-relaxed">
                Нажимая кнопку, вы соглашаетесь с обработкой персональных данных
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
