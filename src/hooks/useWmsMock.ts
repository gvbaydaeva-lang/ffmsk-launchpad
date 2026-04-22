import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Marketplace } from "@/types/domain";
import {
  fetchMockFinanceOperations,
  fetchMockShipmentBoxes,
  fetchMockStockFifo,
  generateMockShipmentBoxes,
} from "@/services/mockWms";

export function useStockFifo() {
  return useQuery({ queryKey: ["wms", "stock-fifo"], queryFn: fetchMockStockFifo });
}

export function useFinanceOperations() {
  return useQuery({ queryKey: ["wms", "finance"], queryFn: fetchMockFinanceOperations });
}

export function useShipmentBoxes() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "shipment-boxes"], queryFn: fetchMockShipmentBoxes });

  const generate = useMutation({
    mutationFn: async (marketplace: Marketplace) => {
      const current = qc.getQueryData<Awaited<ReturnType<typeof fetchMockShipmentBoxes>>>(["wms", "shipment-boxes"]);
      const list = current ?? (await fetchMockShipmentBoxes());
      return generateMockShipmentBoxes(marketplace, list);
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "shipment-boxes"], data);
    },
  });

  return { ...query, generateBoxes: generate.mutateAsync, isGenerating: generate.isPending };
}
