import type { InboundSupply, InventoryMovement, OperationLog, OutboundShipment, TaskWorkflowStatus } from "@/types/domain";
import { PRODUCT_CATALOG_SEED } from "@/services/mockProductCatalog";

const KEY_OUTBOUND = "ffmsk.mock.outbound";
const KEY_INBOUND = "ffmsk.mock.inbound";
const KEY_INVENTORY_MOVEMENTS = "ffmsk.mock.inventoryMovements";
const KEY_OPERATION_LOGS = "ffmsk.mock.operationLogs";
const KEY_PRODUCT_CATALOG = "ffmsk.mock.productCatalog";
const KEY_DEMO_SEEDED = "ffmsk.mock.demoDataSeeded";

function safeReadArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function buildOutboundSeed(): OutboundShipment[] {
  const now = Date.now();
  const mkDate = (deltaHours: number) => new Date(now - deltaHours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "demo-out-1",
      legalEntityId: "le-2",
      productId: "prd-4",
      assignmentId: "ASSIGN-1001",
      assignmentNo: "ОТГ-1001",
      importArticle: "CL-CRM-050",
      importBarcode: "2000000004004",
      importName: "Крем для лица 50 мл",
      importSize: "50 мл",
      importColor: "Белый",
      marketplace: "wb",
      sourceWarehouse: "Коледино",
      shippingMethod: "fbo",
      boxBarcode: "WB-DEMO-BOX-01",
      gateBarcode: "WB-DEMO-GATE-01",
      supplyNumber: "SUP-OUT-1001",
      expiryDate: "2027-12-31",
      packedUnits: 0,
      plannedUnits: 120,
      plannedShipDate: new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      shippedUnits: 0,
      status: "к отгрузке",
      workflowStatus: "pending",
      createdAt: mkDate(36),
    },
    {
      id: "demo-out-2",
      legalEntityId: "le-3",
      productId: "prd-2",
      assignmentId: "ASSIGN-1002",
      assignmentNo: "ОТГ-1002",
      importArticle: "DNM-JNS-032",
      importBarcode: "2000000002002",
      importName: "Джинсы прямые",
      importSize: "M",
      importColor: "Синий",
      marketplace: "ozon",
      sourceWarehouse: "Томилино",
      shippingMethod: "fbo",
      boxBarcode: "OZ-DEMO-BOX-02",
      gateBarcode: "OZ-DEMO-GATE-02",
      supplyNumber: "SUP-OUT-1002",
      expiryDate: "2027-12-31",
      packedUnits: 12,
      plannedUnits: 60,
      plannedShipDate: new Date(now + 48 * 60 * 60 * 1000).toISOString().slice(0, 10),
      shippedUnits: 12,
      status: "к отгрузке",
      workflowStatus: "processing",
      createdAt: mkDate(30),
    },
    {
      id: "demo-out-3",
      legalEntityId: "le-4",
      productId: "prd-1",
      assignmentId: "ASSIGN-1003",
      assignmentNo: "ОТГ-1003",
      importArticle: "SA-BTL-001",
      importBarcode: "2000000001001",
      importName: "Бутылка спорт.",
      importSize: "500 мл",
      importColor: "Прозрачный",
      marketplace: "wb",
      sourceWarehouse: "Коледино",
      shippingMethod: "fbo",
      boxBarcode: "WB-DEMO-BOX-03",
      gateBarcode: "WB-DEMO-GATE-03",
      supplyNumber: "SUP-OUT-1003",
      expiryDate: "2027-12-31",
      packedUnits: 42,
      plannedUnits: 42,
      plannedShipDate: new Date(now + 12 * 60 * 60 * 1000).toISOString().slice(0, 10),
      shippedUnits: 42,
      status: "к отгрузке",
      workflowStatus: "assembled",
      createdAt: mkDate(20),
    },
    {
      id: "demo-out-4",
      legalEntityId: "le-2",
      productId: "prd-5",
      assignmentId: "ASSIGN-1004",
      assignmentNo: "ОТГ-1004",
      importArticle: "CL-CRM-030",
      importBarcode: "2000000004005",
      importName: "Крем для лица 30 мл",
      importSize: "30 мл",
      importColor: "Белый",
      marketplace: "wb",
      sourceWarehouse: "Коледино",
      shippingMethod: "fbo",
      boxBarcode: "WB-DEMO-BOX-04",
      gateBarcode: "WB-DEMO-GATE-04",
      supplyNumber: "SUP-OUT-1004",
      expiryDate: "2027-12-31",
      packedUnits: 80,
      plannedUnits: 80,
      plannedShipDate: new Date(now - 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
      shippedUnits: 80,
      status: "отгружено",
      workflowStatus: "shipped",
      createdAt: mkDate(16),
      completedAt: mkDate(6),
    },
    {
      id: "demo-out-5",
      legalEntityId: "le-1",
      productId: "prd-6",
      assignmentId: "ASSIGN-1005",
      assignmentNo: "ОТГ-1005",
      importArticle: "DEMO-001",
      importBarcode: "2000000000000",
      importName: "Тестовый товар",
      importSize: "L",
      importColor: "Черный",
      marketplace: "yandex",
      sourceWarehouse: "Софьино",
      shippingMethod: "fbs",
      boxBarcode: "YM-DEMO-BOX-05",
      gateBarcode: "YM-DEMO-GATE-05",
      supplyNumber: "SUP-OUT-1005",
      expiryDate: "2027-12-31",
      packedUnits: 14,
      plannedUnits: 20,
      plannedShipDate: new Date(now - 2 * 60 * 60 * 1000).toISOString().slice(0, 10),
      shippedUnits: 14,
      status: "отгружено",
      workflowStatus: "shipped_with_diff" as unknown as TaskWorkflowStatus,
      createdAt: mkDate(12),
      completedAt: mkDate(1),
    },
  ];
}

function buildInboundSeed(): InboundSupply[] {
  const now = Date.now();
  const mkDate = (deltaHours: number) => new Date(now - deltaHours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "demo-in-1",
      legalEntityId: "le-2",
      documentNo: "ПТ-2026-1001",
      supplier: "CareLab",
      destinationWarehouse: "Коледино",
      marketplace: "wb",
      expectedUnits: 120,
      receivedUnits: 0,
      status: "ожидается",
      workflowStatus: "pending",
      eta: new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      createdAt: mkDate(28),
      items: [
        {
          productId: "prd-4",
          barcode: "2000000004004",
          supplierArticle: "CL-CRM-050",
          name: "Крем для лица 50 мл",
          color: "Белый",
          size: "50 мл",
          plannedQuantity: 120,
          factualQuantity: 0,
        },
      ],
    },
    {
      id: "demo-in-2",
      legalEntityId: "le-4",
      documentNo: "ПТ-2026-1002",
      supplier: "SportAqua Factory",
      destinationWarehouse: "Коледино",
      marketplace: "wb",
      expectedUnits: 200,
      receivedUnits: 120,
      status: "на приёмке",
      workflowStatus: "processing",
      eta: new Date(now).toISOString().slice(0, 10),
      createdAt: mkDate(20),
      items: [
        {
          productId: "prd-1",
          barcode: "2000000001001",
          supplierArticle: "SA-BTL-001",
          name: "Бутылка спорт.",
          color: "Прозрачный",
          size: "500 мл",
          plannedQuantity: 200,
          factualQuantity: 120,
        },
      ],
    },
    {
      id: "demo-in-3",
      legalEntityId: "le-3",
      documentNo: "ПТ-2026-1003",
      supplier: "DenimCo",
      destinationWarehouse: "Томилино",
      marketplace: "ozon",
      expectedUnits: 80,
      receivedUnits: 80,
      status: "принято",
      workflowStatus: "completed",
      eta: new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      completedAt: mkDate(8),
      createdAt: mkDate(30),
      items: [
        {
          productId: "prd-2",
          barcode: "2000000002002",
          supplierArticle: "DNM-JNS-032",
          name: "Джинсы прямые",
          color: "Синий",
          size: "M",
          plannedQuantity: 80,
          factualQuantity: 80,
        },
      ],
    },
  ];
}

function buildInventoryMovementsSeed(): InventoryMovement[] {
  const now = Date.now();
  const mkDate = (deltaHours: number) => new Date(now - deltaHours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "demo-mov-1",
      type: "INBOUND",
      taskId: "demo-in-3",
      taskNumber: "ПТ-2026-1003",
      legalEntityId: "le-3",
      legalEntityName: "ООО «ТекстильПро»",
      warehouseName: "Томилино",
      name: "Джинсы прямые",
      sku: "DNM-JNS-032",
      article: "DNM-JNS-032",
      barcode: "2000000002002",
      marketplace: "ozon",
      color: "Синий",
      size: "M",
      qty: 80,
      createdAt: mkDate(8),
      source: "receiving",
    },
    {
      id: "demo-mov-2",
      type: "INBOUND",
      taskId: "seed-base-1",
      taskNumber: "SEED-BASE-1",
      legalEntityId: "le-2",
      legalEntityName: "ООО «БьютиМаркет»",
      warehouseName: "Коледино",
      name: "Крем для лица 50 мл",
      sku: "CL-CRM-050",
      article: "CL-CRM-050",
      barcode: "2000000004004",
      marketplace: "wb",
      color: "Белый",
      size: "50 мл",
      qty: 220,
      createdAt: mkDate(48),
      source: "receiving",
    },
    {
      id: "demo-mov-3",
      type: "INBOUND",
      taskId: "seed-base-2",
      taskNumber: "SEED-BASE-2",
      legalEntityId: "le-2",
      legalEntityName: "ООО «БьютиМаркет»",
      warehouseName: "Коледино",
      name: "Крем для лица 30 мл",
      sku: "CL-CRM-030",
      article: "CL-CRM-030",
      barcode: "2000000004005",
      marketplace: "wb",
      color: "Белый",
      size: "30 мл",
      qty: 180,
      createdAt: mkDate(40),
      source: "receiving",
    },
    {
      id: "demo-mov-4",
      type: "INBOUND",
      taskId: "seed-base-3",
      taskNumber: "SEED-BASE-3",
      legalEntityId: "le-4",
      legalEntityName: "ООО «СпортЛайн»",
      warehouseName: "Коледино",
      name: "Бутылка спорт.",
      sku: "SA-BTL-001",
      article: "SA-BTL-001",
      barcode: "2000000001001",
      marketplace: "wb",
      color: "Прозрачный",
      size: "500 мл",
      qty: 260,
      createdAt: mkDate(32),
      source: "receiving",
    },
  ];
}

function buildOperationLogsSeed(): OperationLog[] {
  const now = Date.now();
  const mkDate = (deltaHours: number) => new Date(now - deltaHours * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "demo-log-1",
      type: "SHIPPING_CREATED",
      taskId: "ASSIGN-1001",
      taskNumber: "ОТГ-1001",
      legalEntityId: "le-2",
      legalEntityName: "ООО «БьютиМаркет»",
      description: "Создана отгрузка №ОТГ-1001",
      createdAt: mkDate(36),
    },
    {
      id: "demo-log-2",
      type: "PACKING_STARTED",
      taskId: "ASSIGN-1002",
      taskNumber: "ОТГ-1002",
      legalEntityId: "le-3",
      legalEntityName: "ООО «ТекстильПро»",
      description: "Задание №ОТГ-1002 взято в работу",
      createdAt: mkDate(28),
    },
    {
      id: "demo-log-3",
      type: "SHIPPING_CONFIRMED",
      taskId: "ASSIGN-1004",
      taskNumber: "ОТГ-1004",
      legalEntityId: "le-2",
      legalEntityName: "ООО «БьютиМаркет»",
      description: "Отгрузка №ОТГ-1004 подтверждена",
      createdAt: mkDate(6),
    },
  ];
}

export function seedDemoData() {
  if (typeof window === "undefined") return;

  const outbound = safeReadArray<OutboundShipment>(KEY_OUTBOUND);
  const inbound = safeReadArray<InboundSupply>(KEY_INBOUND);
  const inventoryMovements = safeReadArray<InventoryMovement>(KEY_INVENTORY_MOVEMENTS);
  const operationLogs = safeReadArray<OperationLog>(KEY_OPERATION_LOGS);
  const hasData = outbound.length > 0 || inbound.length > 0 || inventoryMovements.length > 0 || operationLogs.length > 0;
  const seededFlag = window.localStorage.getItem(KEY_DEMO_SEEDED) === "true";

  console.log("DEMO SEED CHECK", {
    outbound: outbound.length,
    inbound: inbound.length,
    inventoryMovements: inventoryMovements.length,
    operationLogs: operationLogs.length,
    seededFlag,
  });

  if (hasData) {
    console.log("DEMO DATA SKIPPED: EXISTING DATA");
    if (!seededFlag) window.localStorage.setItem(KEY_DEMO_SEEDED, "true");
    return;
  }

  safeWrite(KEY_PRODUCT_CATALOG, PRODUCT_CATALOG_SEED);
  safeWrite(KEY_OUTBOUND, buildOutboundSeed());
  safeWrite(KEY_INBOUND, buildInboundSeed());
  safeWrite(KEY_INVENTORY_MOVEMENTS, buildInventoryMovementsSeed());
  safeWrite(KEY_OPERATION_LOGS, buildOperationLogsSeed());
  window.localStorage.setItem(KEY_DEMO_SEEDED, "true");
  console.log("DEMO DATA SEEDED");
}

