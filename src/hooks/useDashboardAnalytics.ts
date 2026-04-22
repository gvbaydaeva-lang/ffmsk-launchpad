import { useQuery } from "@tanstack/react-query";
import { fetchFfDashboardSnapshot } from "@/services/mockFfDashboard";

export function useFfDashboardSnapshot() {
  return useQuery({
    queryKey: ["ff", "dashboard-snapshot"],
    queryFn: fetchFfDashboardSnapshot,
  });
}
