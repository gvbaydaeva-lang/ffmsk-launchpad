import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "#services", label: "Услуги" },
  { href: "#stats", label: "О нас" },
  { href: "#pricing", label: "Тарифы" },
  { href: "#contact", label: "Контакты" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/60"
          : "bg-transparent"
      )}
    >
      <nav className="container flex h-16 md:h-20 items-center justify-between">
        <a href="#" className="flex items-center gap-2 group">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gradient shadow-glow">
            <span className="font-display text-sm font-bold text-accent-foreground">F</span>
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Full-24Msk
          </span>
        </a>

        <ul className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <Button variant="hero" size="sm" className="h-10 px-5">
          <Phone className="h-4 w-4" />
          <span className="hidden sm:inline">Заказать звонок</span>
          <span className="sm:hidden">Звонок</span>
        </Button>
      </nav>
    </header>
  );
};

export default Navbar;
