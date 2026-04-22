import * as React from "react";
import { format, subDays } from "date-fns";
import { ru } from "date-fns/locale/ru";
import type { DateRange } from "react-day-picker";
import { CalendarCheck, CalendarDays, Globe, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities } from "@/hooks/useWmsMock";
import { toast } from "sonner";

function daysInclusive(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

const GlobalFiltersBar = ({ className }: { className?: string }) => {
  const { dateFrom, dateTo, setDateRange, applyPresetDays, legalEntityId, setLegalEntityId } = useAppFilters();
  const { data: entities, isLoading: entitiesLoading } = useLegalEntities();
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [rangeDraft, setRangeDraft] = React.useState<DateRange | undefined>(() => ({ from: dateFrom, to: dateTo }));

  React.useEffect(() => {
    setRangeDraft({ from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      toast.message("Сканер", { description: "Режим сканирования (демо)." });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const d = daysInclusive(dateFrom, dateTo);
  const isLast7 = d === 7 && format(dateTo, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const isLast30 = d === 30 && format(dateTo, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  let periodLabel = `${format(dateFrom, "d MMM", { locale: ru })} — ${format(dateTo, "d MMM yyyy", { locale: ru })}`;
  if (isLast7) periodLabel = "Последние 7 дней";
  else if (isLast30) periodLabel = "Последние 30 дней";

  const onApplyCalendar = () => {
    const from = rangeDraft?.from;
    const to = rangeDraft?.to ?? rangeDraft?.from;
    if (!from || !to) {
      toast.error("Выберите период");
      return;
    }
    setDateRange(from, to);
    setCalendarOpen(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-10 justify-start gap-2 border-slate-200 bg-white font-normal text-slate-900 shadow-none">
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{periodLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex flex-col gap-3 p-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    applyPresetDays(7);
                    setCalendarOpen(false);
                  }}
                >
                  7 дней
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    applyPresetDays(30);
                    setCalendarOpen(false);
                  }}
                >
                  30 дней
                </Button>
              </div>
              <Calendar
                mode="range"
                numberOfMonths={2}
                defaultMonth={rangeDraft?.from ?? dateFrom}
                selected={rangeDraft}
                onSelect={setRangeDraft}
                locale={ru}
              />
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCalendarOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" onClick={onApplyCalendar}>
                  Применить
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-1">
        <Button
          type="button"
          className="h-10 gap-2 bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => toast.message("Закрыть день", { description: "Демо: закрытие операционного дня." })}
        >
          <CalendarCheck className="h-4 w-4" />
          Закрыть день
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2 border-slate-200 bg-white shadow-none"
          onClick={() => toast.message("Сканер", { description: "Горячая клавиша: /" })}
        >
          <ScanLine className="h-4 w-4 text-slate-600" />
          Сканер
          <kbd className="pointer-events-none hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 sm:inline">
            /
          </kbd>
        </Button>
      </div>

      <div className="flex min-w-[200px] flex-1 items-center justify-end sm:max-w-xs sm:flex-none">
        <Select value={legalEntityId} onValueChange={(v) => setLegalEntityId(v as "all" | string)} disabled={entitiesLoading}>
          <SelectTrigger className="h-10 w-full border-slate-200 bg-white shadow-none sm:min-w-[220px]">
            <div className="flex items-center gap-2 truncate">
              <Globe className="h-4 w-4 shrink-0 text-slate-500" />
              <SelectValue placeholder="Юрлицо" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все юрлица</SelectItem>
            {entities?.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.shortName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default GlobalFiltersBar;
