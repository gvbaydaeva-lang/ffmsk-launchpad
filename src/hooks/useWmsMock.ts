import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FulfillmentTariffs,
  InboundSupply,
  LegalEntity,
  Marketplace,
  OutboundShipment,
  OperationHistoryEvent,
  ProductCatalogItem,
  OrgUser,
  WarehouseInventoryRow,
} from "@/types/domain";
import { appendMockOutbound, fetchMockOutboundShipments, persistOutboundDurably, saveMockOutbound } from "@/services/mockOutbound";
import { appendMockInbound, fetchMockInboundSupplies, persistInboundDurably, saveMockInbound } from "@/services/mockReceiving";
import { closeOperationalDay } from "@/services/financeCloseDay";
import { fetchMockOperationHistory, prependOperationEvent } from "@/services/mockOperationHistory";
import {
  appendMockProductCatalogItem,
  fetchMockProductCatalog,
  saveMockProductCatalog,
  updateMockProductCatalogItem,
} from "@/services/mockProductCatalog";
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
    onSuccess: async (data, vars) => {
      qc.setQueryData(["wms", "shipment-boxes"], data);
      const history = qc.getQueryData<OperationHistoryEvent[]>(["wms", "operation-history"]) ?? (await fetchMockOperationHistory());
      qc.setQueryData(
        ["wms", "operation-history"],
        prependOperationEvent(history, {
          dateIso: new Date().toISOString(),
          legalEntityId: vars.legalEntityId,
          actor: "Оператор отгрузки",
          action: "отгрузка",
          productLabel: `Короб ${vars.marketplace.toUpperCase()}`,
          quantity: data[0]?.itemsCount ?? 0,
          comment: data[0] ? `Сформирован ${data[0].boxBarcode}` : "Сформирован короб",
        }),
      );
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
    onSuccess: async (data, vars) => {
      qc.setQueryData(["wms", "inbound"], data);
      saveMockInbound(data);
      void persistInboundDurably(data);
      const history = qc.getQueryData<OperationHistoryEvent[]>(["wms", "operation-history"]) ?? (await fetchMockOperationHistory());
      qc.setQueryData(
        ["wms", "operation-history"],
        prependOperationEvent(history, {
          dateIso: new Date().toISOString(),
          legalEntityId: vars.legalEntityId,
          actor: "Оператор приёмки",
          action: "приёмка",
          productLabel: vars.documentNo,
          quantity: vars.expectedUnits,
          comment: `Создана приёмка ${vars.documentNo}`,
        }),
      );
    },
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: InboundSupply["status"]; receivedUnits?: number }) => {
      const inbound = qc.getQueryData<InboundSupply[]>(["wms", "inbound"]) ?? (await fetchMockInboundSupplies());
      const catalog = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? (await fetchMockProductCatalog());
      const row = inbound.find((x) => x.id === args.id);
      if (!row) return { inbound, catalog };

      const nextInbound = inbound.map((x) =>
        x.id === args.id
          ? {
              ...x,
              status: args.status,
              receivedUnits: args.receivedUnits ?? x.receivedUnits,
            }
          : x,
      );

      let nextCatalog = catalog;
      const becomesAccepted = row.status !== "принято" && args.status === "принято";
      if (becomesAccepted) {
        const dateIso = new Date().toISOString();
        nextCatalog = catalog.map((p) => {
          const hit = row.items.find((it) => (it.productId ? it.productId === p.id : it.barcode === p.barcode || it.supplierArticle === p.supplierArticle));
          if (!hit) return p;
          const qty = hit.factualQuantity || hit.plannedQuantity || 0;
          const receiptHistory = [...p.receiptHistory, { dateIso, documentNo: row.documentNo, quantity: qty }];
          const stockOnHand = receiptHistory.reduce((s, h) => s + h.quantity, 0);
          return { ...p, receiptHistory, stockOnHand };
        });
      }
      return { inbound: nextInbound, catalog: nextCatalog };
    },
    onSuccess: ({ inbound, catalog }) => {
      qc.setQueryData(["wms", "inbound"], inbound);
      qc.setQueryData(["wms", "product-catalog"], catalog);
      saveMockInbound(inbound);
      void persistInboundDurably(inbound);
      saveMockProductCatalog(catalog);
    },
  });

  const updateDraft = useMutation({
    mutationFn: async (args: { id: string; items: InboundSupply["items"]; marketplace?: Marketplace; workflowStatus?: InboundSupply["workflowStatus"] }) => {
      const inbound = qc.getQueryData<InboundSupply[]>(["wms", "inbound"]) ?? (await fetchMockInboundSupplies());
      const next = inbound.map((x) =>
        x.id === args.id
          ? {
              ...x,
              items: args.items,
              marketplace: args.marketplace ?? x.marketplace,
              workflowStatus: args.workflowStatus ?? x.workflowStatus,
              expectedUnits: args.items.reduce((s, it) => s + it.plannedQuantity, 0),
              receivedUnits: args.items.reduce((s, it) => s + it.factualQuantity, 0),
            }
          : x,
      );
      await persistInboundDurably(next);
      return next;
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "inbound"], data);
    },
  });

  return {
    ...query,
    createInbound: create.mutateAsync,
    isCreating: create.isPending,
    setInboundStatus: setStatus.mutateAsync,
    isUpdatingInbound: setStatus.isPending,
    updateInboundDraft: updateDraft.mutateAsync,
    isUpdatingInboundDraft: updateDraft.isPending,
  };
}

export function useOutboundShipments() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "outbound"], queryFn: fetchMockOutboundShipments });

  const create = useMutation({
    mutationFn: async (draft: Omit<OutboundShipment, "id" | "createdAt">) => {
      const outbound = qc.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? (await fetchMockOutboundShipments());
      const catalog = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? (await fetchMockProductCatalog());
      /** Импорт без позиции в каталоге — строка только для плана/упаковки, остаток не трогаем */
      const isOrphanImportLine = draft.productId.startsWith("orphan:");
      if (isOrphanImportLine) {
        const nextOutbound = appendMockOutbound(outbound, draft);
        return { nextOutbound, nextCatalog: catalog };
      }
      const product = catalog.find((p) => p.id === draft.productId);
      if (!product || product.stockOnHand < draft.plannedUnits) {
        throw new Error("insufficient_stock");
      }
      const nextOutbound = appendMockOutbound(outbound, draft);
      let nextCatalog = catalog;
      if (draft.status === "готов к отгрузке (резерв)") {
        nextCatalog = catalog.map((p) =>
          p.id === draft.productId ? { ...p, stockOnHand: Math.max(0, p.stockOnHand - draft.plannedUnits) } : p,
        );
      }
      return { nextOutbound, nextCatalog };
    },
    onSuccess: ({ nextOutbound, nextCatalog }) => {
      qc.setQueryData(["wms", "outbound"], nextOutbound);
      qc.setQueryData(["wms", "product-catalog"], nextCatalog);
      saveMockOutbound(nextOutbound);
      void persistOutboundDurably(nextOutbound);
      saveMockProductCatalog(nextCatalog);
    },
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: OutboundShipment["status"]; shippedUnits?: number }) => {
      const outbound = qc.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? (await fetchMockOutboundShipments());
      const catalog = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? (await fetchMockProductCatalog());
      const row = outbound.find((x) => x.id === args.id);
      if (!row) return { outbound, catalog };

      const qty = args.shippedUnits ?? row.shippedUnits ?? row.plannedUnits;
      const nextOutbound = outbound.map((x) =>
        x.id === args.id
          ? {
              ...x,
              status: args.status,
              shippedUnits: args.shippedUnits ?? x.shippedUnits,
            }
          : x,
      );

      let nextCatalog = catalog;
      const becomesShipped = row.status !== "отгружено" && args.status === "отгружено";
      const isOrphanImportLine = row.productId.startsWith("orphan:");
      if (becomesShipped && !isOrphanImportLine) {
        nextCatalog = catalog.map((p) =>
          p.id === row.productId ? { ...p, stockOnHand: Math.max(0, p.stockOnHand - qty) } : p,
        );
      }
      return { outbound: nextOutbound, catalog: nextCatalog };
    },
    onSuccess: ({ outbound, catalog }) => {
      qc.setQueryData(["wms", "outbound"], outbound);
      qc.setQueryData(["wms", "product-catalog"], catalog);
      saveMockOutbound(outbound);
      void persistOutboundDurably(outbound);
      saveMockProductCatalog(catalog);
    },
  });

  const updateDraft = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OutboundShipment> }) => {
      const outbound = qc.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? (await fetchMockOutboundShipments());
      const next = outbound.map((x) => (x.id === id ? { ...x, ...patch } : x));
      await persistOutboundDurably(next);
      return next;
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "outbound"], data);
    },
  });

  return {
    ...query,
    createOutbound: create.mutateAsync,
    isCreatingOutbound: create.isPending,
    setOutboundStatus: setStatus.mutateAsync,
    isUpdatingOutbound: setStatus.isPending,
    updateOutboundDraft: updateDraft.mutateAsync,
    isUpdatingOutboundDraft: updateDraft.isPending,
  };
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

export function useProductCatalog() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "product-catalog"], queryFn: fetchMockProductCatalog });
  const add = useMutation({
    mutationFn: async (draft: Omit<ProductCatalogItem, "id" | "barcode"> & { barcode?: string }) => {
      const cur = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? (await fetchMockProductCatalog());
      return appendMockProductCatalogItem(cur, draft);
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "product-catalog"], data);
      saveMockProductCatalog(data);
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductCatalogItem> }) => {
      const cur = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? (await fetchMockProductCatalog());
      return updateMockProductCatalogItem(cur, id, patch);
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "product-catalog"], data);
      saveMockProductCatalog(data);
    },
  });
  return {
    ...query,
    addProduct: add.mutateAsync,
    isAddingProduct: add.isPending,
    updateProduct: update.mutateAsync,
    isUpdatingProduct: update.isPending,
  };
}

export function useOperationHistory() {
  return useQuery({ queryKey: ["wms", "operation-history"], queryFn: fetchMockOperationHistory });
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

export function useUpdateLegalEntitySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Pick<LegalEntity, "storageModel" | "tariffs">> }) => {
      const cur = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
      return cur.map((e) => (e.id === args.id ? { ...e, ...args.patch } : e));
    },
    onSuccess: (next) => qc.setQueryData(["wms", "legal"], next),
  });
}

export function useCloseOperationalDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const finance = qc.getQueryData(["wms", "finance"]) as Awaited<ReturnType<typeof fetchMockFinanceOperations>> | undefined;
      const legal = qc.getQueryData(["wms", "legal"]) as LegalEntity[] | undefined;
      const inv = qc.getQueryData(["wms", "warehouse-inventory"]) as WarehouseInventoryRow[] | undefined;
      const currentFinance = finance ?? (await fetchMockFinanceOperations());
      const currentLegal = legal ?? (await fetchMockLegalEntities());
      const currentInv = inv ?? (await fetchMockWarehouseInventory());
      return closeOperationalDay(currentFinance, currentInv, currentLegal);
    },
    onSuccess: async (result) => {
      qc.setQueryData(["wms", "finance"], result.operations);
      const history = qc.getQueryData<OperationHistoryEvent[]>(["wms", "operation-history"]) ?? (await fetchMockOperationHistory());
      const next = prependOperationEvent(history, {
        dateIso: new Date().toISOString(),
        legalEntityId: "all",
        actor: "Система",
        action: "закрытие дня",
        productLabel: "Все остатки склада",
        quantity: result.totalUnits,
        comment: `Начислено ${result.totalAccruedRub.toLocaleString("ru-RU")} ₽`,
      });
      qc.setQueryData(["wms", "operation-history"], next);
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
