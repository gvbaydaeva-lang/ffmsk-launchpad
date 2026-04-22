import { Badge } from "@/components/ui/badge";
import { MARKETPLACE_CHART_COLORS, MARKETPLACE_LABELS } from "@/lib/marketplace";
import type { Marketplace } from "@/types/domain";
import { cn } from "@/lib/utils";

const short: Record<Marketplace, string> = {
  wb: "WB",
  ozon: "Ozon",
  yandex: "Я.М",
};

type Props = {
  marketplace: Marketplace;
  variant?: "full" | "short";
  className?: string;
};

const MarketplaceBadge = ({ marketplace, variant = "short", className }: Props) => {
  const color = MARKETPLACE_CHART_COLORS[marketplace];
  const label = variant === "full" ? MARKETPLACE_LABELS[marketplace] : short[marketplace];

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium text-white shadow-none", className)}
      style={{ backgroundColor: color }}
    >
      {label}
    </Badge>
  );
};

export default MarketplaceBadge;
