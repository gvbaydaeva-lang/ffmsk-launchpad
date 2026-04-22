import { useQuery } from "@tanstack/react-query";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { fetchDashboardBundle } from "@/services/mockDashboardBundle";

export function useDashboardBundleQuery() {
  const { dateFromIso, dateToIso, legalEntityId } = useAppFilters();
  return useQuery({
    queryKey: ["dashboard", "bundle", dateFromIso, dateToIso, legalEntityId],
    queryFn: () =>
      fetchDashboardBundle({
        dateFromIso,
        dateToIso,
        legalEntityId,
      }),
  });
}
