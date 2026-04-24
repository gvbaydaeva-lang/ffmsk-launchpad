import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, Filter, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type Props = {
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSortAscText?: () => void;
  onSortDescText?: () => void;
  onSortAscNum?: () => void;
  onSortDescNum?: () => void;
};

/**
 * Компактное меню «как в Excel»: сортировка + поиск по значению в колонке.
 */
export function ExcelColumnFilterMenu({
  title,
  searchValue,
  onSearchChange,
  onSortAscText,
  onSortDescText,
  onSortAscNum,
  onSortDescNum,
}: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
          title={`Фильтр: ${title}`}
          aria-label={`Фильтр колонки ${title}`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-2 text-[11px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="px-1 py-1 text-[10px] font-normal text-muted-foreground">Сортировка</DropdownMenuLabel>
        {onSortAscText && (
          <DropdownMenuItem className="gap-2 py-1.5" onClick={() => { onSortAscText(); setOpen(false); }}>
            <ArrowDownAZ className="h-3.5 w-3.5" />
            А → Я
          </DropdownMenuItem>
        )}
        {onSortDescText && (
          <DropdownMenuItem className="gap-2 py-1.5" onClick={() => { onSortDescText(); setOpen(false); }}>
            <ArrowUpAZ className="h-3.5 w-3.5" />
            Я → А
          </DropdownMenuItem>
        )}
        {onSortAscNum && (
          <DropdownMenuItem className="gap-2 py-1.5" onClick={() => { onSortAscNum(); setOpen(false); }}>
            <Hash className="h-3.5 w-3.5" />
            По возрастанию
          </DropdownMenuItem>
        )}
        {onSortDescNum && (
          <DropdownMenuItem className="gap-2 py-1.5" onClick={() => { onSortDescNum(); setOpen(false); }}>
            <Hash className="h-3.5 w-3.5" />
            По убыванию
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-1 py-1 text-[10px] font-normal text-muted-foreground">Поиск в колонке</DropdownMenuLabel>
        <Input
          className="h-7 text-[11px]"
          placeholder="Текст…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Заголовок ячейки: подпись + фильтр в одну линию */
export function ExcelThWithFilter({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <th className={className}>
      <div className="flex items-center justify-between gap-0.5">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {children}
      </div>
    </th>
  );
}
