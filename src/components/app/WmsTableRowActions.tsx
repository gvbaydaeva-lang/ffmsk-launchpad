import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type WmsRowActionItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

const outlineSm =
  "h-8 min-w-[7.25rem] justify-center px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Единый паттерн колонки «Действия»: 1–2 пункта — кнопки, 3+ — компактное меню.
 */
export function WmsTableRowActions({
  items,
  className,
}: {
  items: WmsRowActionItem[];
  className?: string;
}) {
  const usable = items.filter(Boolean);
  if (usable.length === 0) {
    return (
      <span className={cn("text-xs tabular-nums text-slate-400", className)} aria-hidden>
        —
      </span>
    );
  }
  if (usable.length <= 2) {
    return (
      <div className={cn("flex flex-col items-end gap-1", className)}>
        {usable.map((it) => (
          <Button
            key={it.id}
            type="button"
            variant="outline"
            size="sm"
            className={outlineSm}
            disabled={it.disabled}
            onClick={(e) => {
              e.stopPropagation();
              it.onSelect();
            }}
          >
            {it.label}
          </Button>
        ))}
      </div>
    );
  }
  const triggerDisabled = usable.every((x) => x.disabled);
  return (
    <div className={cn("flex justify-end", className)} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={triggerDisabled}
            onClick={(e) => e.stopPropagation()}
          >
            Действия
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]" onPointerDown={(e) => e.stopPropagation()}>
          {usable.map((it) => (
            <DropdownMenuItem
              key={it.id}
              disabled={it.disabled}
              className="text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onSelect={() => {
                it.onSelect();
              }}
            >
              {it.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
