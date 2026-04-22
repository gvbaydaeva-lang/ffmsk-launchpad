import type { Marketplace } from "@/types/domain";
import type { ShipmentBox } from "@/types/domain";
/** UTF-8 BOM — Excel корректно открывает кириллицу в .csv */
function withBom(content: string) {
  return `\uFEFF${content}`;
}

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Колонки под требования площадок (демо-наборы полей). */
export function exportShipmentBoxesForMarketplace(boxes: ShipmentBox[], marketplace: Marketplace) {
  const filtered = boxes.filter((b) => b.marketplace === marketplace);
  const label = MARKETPLACE_LABELS[marketplace].replace(/\s+/g, "_");

  if (marketplace === "wb") {
    const cols = ["transit_barcode", "box_number", "items_qty", "weight_kg", "created_at"];
    const rows = filtered.map((b, i) =>
      [b.boxBarcode, String(i + 1), String(b.itemsCount), String(b.weightKg), b.createdAt].join(";"),
    );
    const csv = withBom([cols.join(";"), ...rows].join("\n"));
    download("wb_supply_boxes.csv", "text/csv;charset=utf-8", csv);
    return;
  }

  if (marketplace === "ozon") {
    const cols = ["package_id", "quantity", "weight", "timestamp_iso"];
    const rows = filtered.map((b) => [b.boxBarcode, String(b.itemsCount), String(b.weightKg), b.createdAt].join(";"));
    const csv = withBom([cols.join(";"), ...rows].join("\n"));
    download(`ozon_fbo_boxes.csv`, "text/csv;charset=utf-8", csv);
    return;
  }

  const cols = ["campaign_box_id", "units", "mass_kg", "dt"];
  const rows = filtered.map((b) => [b.boxBarcode, String(b.itemsCount), String(b.weightKg), b.createdAt].join(";"));
  const csv = withBom([cols.join(";"), ...rows].join("\n"));
  download(`yandex_market_boxes.csv`, "text/csv;charset=utf-8", csv);
}
