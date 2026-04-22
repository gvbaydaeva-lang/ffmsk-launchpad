import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FulfillmentTariffs, InboundSupply, LegalEntity, Marketplace, OrgUser, WarehouseInventoryRow } from "@/types/domain";
import { appendMockInbound, fetchMockInboundSupplies } from "@/services/mockReceiving";
import {
  appendMockLegalEntity,
  appendMockOrgUser,
  fetchMockFinanceOperations,
  fetchMockLegalEntities,
  fetchMockOrgUsers,
  fetchMockShipmentBoxes,
  fetchMockStockFifo,
  generateMockShipmentBoxes,
} from "@/services/mockWms";
import { fetchMockWarehouseInventory } from "@/services/mockWarehouseInventory";
import { mergeLegalWarehouseCounts } from "@/services/scanWorkflow";

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
    mutationFn: async (args: { marketplace: Marketplace; legalEntityId: string }) => {
      const current = qc.getQueryData<Awaited<ReturnType<typeof fetchMockShipmentBoxes>>>(["wms", "shipment-boxes"]);
      const list = current ?? (await fetchMockShipmentBoxes());
      return generateMockShipmentBoxes(args.marketplace, args.legalEntityId, list);
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "shipment-boxes"], data);
    },
  });

  return { ...query, generateBoxes: generate.mutateAsync, isGenerating: generate.isPending };
}

export function useInboundSupplies() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "inbound"], queryFn: fetchMockInboundSupplies });

  const create = useMutation({
    mutationFn: async (draft: Omit<InboundSupply, "id">) => {
      const cur = qc.getQueryData<InboundSupply[]>(["wms", "inbound"]) ?? (await fetchMockInboundSupplies());
      return appendMockInbound(cur, draft);
    },
    onSuccess: (data) => qc.setQueryData(["wms", "inbound"], data),
  });

  return { ...query, createInbound: create.mutateAsync, isCreating: create.isPending };
}

export function useLegalEntities() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "legal"], queryFn: fetchMockLegalEntities });

  const add = useMutation({
    mutationFn: async (draft: Omit<LegalEntity, "id">) => {
      const cur = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
      return appendMockLegalEntity(cur, draft);
    },
    onSuccess: (data) => qc.setQueryData(["wms", "legal"], data),
  });

  return { ...query, addEntity: add.mutateAsync, isAdding: add.isPending };
}

export function useWarehouseInventory() {
  return useQuery({ queryKey: ["wms", "warehouse-inventory"], queryFn: fetchMockWarehouseInventory });
}

export function useUpdateLegalTariffs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tariffs }: { id: string; tariffs: FulfillmentTariffs }) => {
      const cur = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
      const nextLeg = cur.map((e) => (e.id === id ? { ...e, tariffs } : e));
      let inv = qc.getQueryData<WarehouseInventoryRow[]>(["wms", "warehouse-inventory"]);
      if (!inv) inv = await fetchMockWarehouseInventory();
      const t = tariffs.storagePerUnitDayRub;
      const nextInv = inv.map((r) =>
        r.legalEntityId === id
          ? {
              ...r,
              tariffPerUnitDayRub: t,
              storagePerDayRub: Math.round(r.quantity * t * 100) / 100,
            }
          : r,
      );
      return { nextLeg, nextInv };
    },
    onSuccess: ({ nextLeg, nextInv }) => {
      qc.setQueryData(["wms", "warehouse-inventory"], nextInv);
      qc.setQueryData(["wms", "legal"], mergeLegalWarehouseCounts(nextLeg, nextInv));
    },
  });
}

export function useOrgUsers() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "org-users"], queryFn: fetchMockOrgUsers });

  const add = useMutation({
    mutationFn: async (draft: Omit<OrgUser, "id">) => {
      const cur = qc.getQueryData<OrgUser[]>(["wms", "org-users"]) ?? (await fetchMockOrgUsers());
      return appendMockOrgUser(cur, draft);
    },
    onSuccess: (data) => qc.setQueryData(["wms", "org-users"], data),
  });

  return { ...query, addUser: add.mutateAsync, isAdding: add.isPending };
}
