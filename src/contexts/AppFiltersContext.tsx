import * as React from "react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";

export type AppFiltersState = {
  dateFrom: Date;
  dateTo: Date;
  /** Выбранное юрлицо или все */
  legalEntityId: "all" | string;
};

type AppFiltersContextValue = AppFiltersState & {
  setDateRange: (from: Date, to: Date) => void;
  setLegalEntityId: (id: "all" | string) => void;
  applyPresetDays: (days: 7 | 30) => void;
  dateFromIso: string;
  dateToIso: string;
};

const AppFiltersContext = React.createContext<AppFiltersContextValue | null>(null);

function toStartIso(d: Date) {
  return format(startOfDay(d), "yyyy-MM-dd");
}

function toEndIso(d: Date) {
  return format(endOfDay(d), "yyyy-MM-dd");
}

export function AppFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateTo, setDateTo] = React.useState(() => endOfDay(new Date()));
  const [dateFrom, setDateFrom] = React.useState(() => startOfDay(subDays(new Date(), 29)));
  const [legalEntityId, setLegalEntityId] = React.useState<"all" | string>("all");

  const setDateRange = React.useCallback((from: Date, to: Date) => {
    setDateFrom(startOfDay(from));
    setDateTo(endOfDay(to));
  }, []);

  const applyPresetDays = React.useCallback((days: 7 | 30) => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), days - 1));
    setDateFrom(start);
    setDateTo(end);
  }, []);

  const value = React.useMemo<AppFiltersContextValue>(
    () => ({
      dateFrom,
      dateTo,
      legalEntityId,
      setDateRange,
      setLegalEntityId,
      applyPresetDays,
      dateFromIso: toStartIso(dateFrom),
      dateToIso: toEndIso(dateTo),
    }),
    [dateFrom, dateTo, legalEntityId, setDateRange, applyPresetDays],
  );

  return <AppFiltersContext.Provider value={value}>{children}</AppFiltersContext.Provider>;
}

export function useAppFilters() {
  const ctx = React.useContext(AppFiltersContext);
  if (!ctx) throw new Error("useAppFilters must be used within AppFiltersProvider");
  return ctx;
}
