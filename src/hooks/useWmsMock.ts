import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FulfillmentTariffs,
  InboundSupply,
  LegalEntity,
  Location,
  Marketplace,
  OutboundShipment,
  OperationHistoryEvent,
  OperationLog,
  ProductCatalogItem,
  OrgUser,
  WarehouseInventoryRow,
  InventoryMovement,
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
import { buildInboundReceivingInventoryMovements } from "@/lib/inventoryMovementsFromInbound";
import {
  addInventoryMovements as pushInventoryMovements,
  getInventoryBalance,
  getInventoryMovements,
  hasReceivingInboundMovements,
} from "@/services/mockInventoryMovements";
import { addOperationLog as persistOperationLog, fetchOperationLogs } from "@/services/mockOperationLogs";
import { mergeLegalWarehouseCounts } from "@/services/scanWorkflow";
import { appendMockLocation, fetchMockLocations, saveMockLocations } from "@/services/mockLocations";

async function pushLegacyOperationHistory(
  qc: ReturnType<typeof useQueryClient>,
  entry: Omit<OperationHistoryEvent, "id">,
) {
  const history = qc.getQueryData<OperationHistoryEvent[]>(["wms", "operation-history"]) ?? (await fetchMockOperationHistory());
  qc.setQueryData(["wms", "operation-history"], prependOperationEvent(history, entry));
}

export function useInventoryMovements() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "inventory-movements"], queryFn: getInventoryMovements });
  const append = useMutation({
    mutationFn: async (moves: InventoryMovement[]) => pushInventoryMovements(moves),
    onSuccess: (data, variables) => {
      qc.setQueryData(["wms", "inventory-movements"], data);
      const first = variables[0];
      if (first) {
        const row = persistOperationLog({
          type: "INVENTORY_CHANGED",
          taskId: first.taskId,
          taskNumber: first.taskNumber,
          legalEntityId: first.legalEntityId,
          legalEntityName: first.legalEntityName,
          description: `Остатки обновлены по заданию №${first.taskNumber || first.taskId}`,
        });
        qc.setQueryData<OperationLog[]>(["wms", "operation-logs"], (prev) => [row, ...(prev ?? [])]);
      }
    },
  });
  const balance = React.useMemo(
    () => getInventoryBalance(query.data ?? []),
    [query.data],
  );
  return {
    ...query,
    addInventoryMovements: append.mutateAsync,
    isAppending: append.isPending,
    balanceRows: balance,
  };
}

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
      const legalRows = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
      const leName = legalRows.find((e) => e.id === vars.legalEntityId)?.shortName ?? vars.legalEntityId;
      const created = data.find((d) => d.documentNo === vars.documentNo && d.legalEntityId === vars.legalEntityId);
      const wmsRow = persistOperationLog({
        type: "RECEIVING_CREATED",
        legalEntityId: vars.legalEntityId,
        legalEntityName: leName,
        taskId: created?.id,
        taskNumber: vars.documentNo,
        description: `Создана приёмка №${vars.documentNo}`,
      });
      qc.setQueryData<OperationLog[]>(["wms", "operation-logs"], (prev) => [wmsRow, ...(prev ?? [])]);
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

        const invExisting =
          qc.getQueryData<InventoryMovement[]>(["wms", "inventory-movements"]) ?? (await getInventoryMovements());
        if (!hasReceivingInboundMovements(row.id, invExisting)) {
          const legalRows = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
          const leName = legalRows.find((e) => e.id === row.legalEntityId)?.shortName ?? row.legalEntityId;
          const locations = qc.getQueryData<Location[]>(["wms", "locations"]) ?? (await fetchMockLocations());
          const receivingLocation = (Array.isArray(locations) ? locations : []).find((loc) => loc?.type === "receiving");
          const receivingLocationId = (receivingLocation?.id || "").trim() || "loc-receiving";
          const moves = buildInboundReceivingInventoryMovements(row, leName, receivingLocationId);
          if (moves.length > 0) {
            const nextInv = pushInventoryMovements(moves);
            qc.setQueryData(["wms", "inventory-movements"], nextInv);
            const opRow = persistOperationLog({
              type: "INVENTORY_CHANGED",
              taskId: moves[0].taskId,
              taskNumber: moves[0].taskNumber,
              legalEntityId: moves[0].legalEntityId,
              legalEntityName: moves[0].legalEntityName,
              description: `Остатки обновлены по заданию №${moves[0].taskNumber || moves[0].taskId}`,
            });
            qc.setQueryData<OperationLog[]>(["wms", "operation-logs"], (prev) => [opRow, ...(prev ?? [])]);
          }
        }
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
    mutationFn: async (args: {
      id: string;
      items: InboundSupply["items"];
      marketplace?: Marketplace;
      workflowStatus?: InboundSupply["workflowStatus"];
      completedWithDiscrepancies?: boolean;
    }) => {
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
              completedWithDiscrepancies:
                args.completedWithDiscrepancies ?? x.completedWithDiscrepancies ?? false,
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
      if (!product) {
        throw new Error("product_not_found");
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
    onSuccess: async ({ nextOutbound, nextCatalog }, vars) => {
      qc.setQueryData(["wms", "outbound"], nextOutbound);
      qc.setQueryData(["wms", "product-catalog"], nextCatalog);
      saveMockOutbound(nextOutbound);
      void persistOutboundDurably(nextOutbound);
      saveMockProductCatalog(nextCatalog);
      await pushLegacyOperationHistory(qc, {
        dateIso: new Date().toISOString(),
        legalEntityId: vars.legalEntityId,
        actor: "Оператор отгрузки",
        action: "отгрузка",
        productLabel: vars.assignmentNo ?? vars.assignmentId ?? "Задание отгрузки",
        quantity: vars.plannedUnits,
        comment: `Создана отгрузка ${vars.assignmentNo ?? vars.assignmentId ?? ""}`.trim(),
      });
      await pushLegacyOperationHistory(qc, {
        dateIso: new Date().toISOString(),
        legalEntityId: vars.legalEntityId,
        actor: "Система",
        action: "отгрузка",
        productLabel: vars.assignmentNo ?? vars.assignmentId ?? "Задание отгрузки",
        quantity: vars.plannedUnits,
        comment: "Отгрузка передана в упаковщик",
      });
      const legalRows = qc.getQueryData<LegalEntity[]>(["wms", "legal"]) ?? (await fetchMockLegalEntities());
      const leName = legalRows.find((e) => e.id === vars.legalEntityId)?.shortName ?? vars.legalEntityId;
      const no = (vars.assignmentNo?.trim() || vars.assignmentId?.trim() || "") || "—";
      const wmsRow = persistOperationLog({
        type: "SHIPPING_CREATED",
        legalEntityId: vars.legalEntityId,
        legalEntityName: leName,
        taskNumber: no,
        taskId: vars.assignmentId ?? no,
        description: `Создана отгрузка №${no}`,
      });
      qc.setQueryData<OperationLog[]>(["wms", "operation-logs"], (prev) => [wmsRow, ...(prev ?? [])]);
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
    onSuccess: async ({ outbound, catalog }, vars) => {
      qc.setQueryData(["wms", "outbound"], outbound);
      qc.setQueryData(["wms", "product-catalog"], catalog);
      saveMockOutbound(outbound);
      void persistOutboundDurably(outbound);
      saveMockProductCatalog(catalog);
      if (vars.status === "отгружено") {
        const row = outbound.find((x) => x.id === vars.id);
        if (row) {
          await pushLegacyOperationHistory(qc, {
            dateIso: new Date().toISOString(),
            legalEntityId: row.legalEntityId,
            actor: "Упаковщик",
            action: "отгрузка",
            productLabel: row.assignmentNo ?? row.assignmentId ?? row.id,
            quantity: vars.shippedUnits ?? row.shippedUnits ?? 0,
            comment: "Задание завершено",
          });
        }
      }
    },
  });

  const updateDraft = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OutboundShipment> }) => {
      const outbound = qc.getQueryData<OutboundShipment[]>(["wms", "outbound"]) ?? (await fetchMockOutboundShipments());
      const next = outbound.map((x) => (x.id === id ? { ...x, ...patch } : x));
      await persistOutboundDurably(next);
      return next;
    },
    onSuccess: async (data, vars) => {
      qc.setQueryData(["wms", "outbound"], data);
      const row = data.find((x) => x.id === vars.id);
      if (!row) return;
      if (vars.patch.workflowStatus === "processing") {
        await pushLegacyOperationHistory(qc, {
          dateIso: new Date().toISOString(),
          legalEntityId: row.legalEntityId,
          actor: "Упаковщик",
          action: "сканирование",
          productLabel: row.assignmentNo ?? row.assignmentId ?? row.id,
          quantity: 0,
          comment: "Задание взято в работу",
        });
      }
      const hasScanUpdate =
        typeof vars.patch.packedUnits === "number" ||
        typeof vars.patch.packedQty === "number" ||
        typeof vars.patch.shippedUnits === "number";
      if (hasScanUpdate) {
        await pushLegacyOperationHistory(qc, {
          dateIso: new Date().toISOString(),
          legalEntityId: row.legalEntityId,
          actor: "Упаковщик",
          action: "сканирование",
          productLabel: row.assignmentNo ?? row.assignmentId ?? row.id,
          quantity: 1,
          comment: "Товар отсканирован",
        });
      }
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

export function useLocations() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["wms", "locations"], queryFn: fetchMockLocations });

  const add = useMutation({
    mutationFn: async (draft: Omit<Location, "id" | "createdAt">) => {
      const cur = qc.getQueryData<Location[]>(["wms", "locations"]) ?? (await fetchMockLocations());
      return appendMockLocation(cur, draft);
    },
    onSuccess: (data) => {
      qc.setQueryData(["wms", "locations"], data);
      saveMockLocations(data);
    },
  });

  return {
    ...query,
    addLocation: add.mutateAsync,
    isAddingLocation: add.isPending,
  };
}

export function useOperationHistory() {
  return useQuery({ queryKey: ["wms", "operation-history"], queryFn: fetchMockOperationHistory });
}

export function useOperationLogs() {
  return useQuery({ queryKey: ["wms", "operation-logs"], queryFn: fetchOperationLogs });
}

/** Добавить запись в журнал WMS (localStorage + кэш React Query). */
export function useAppendOperationLog() {
  const qc = useQueryClient();
  return React.useCallback(
    (entry: Omit<OperationLog, "id"> & { id?: string; createdAt?: string }) => {
      const row = persistOperationLog(entry);
      qc.setQueryData<OperationLog[]>(["wms", "operation-logs"], (prev) => [row, ...(prev ?? [])]);
      return row;
    },
    [qc],
  );
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
