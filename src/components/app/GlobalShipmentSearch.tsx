import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useOutboundShipments, useProductCatalog } from "@/hooks/useWmsMock";
import { cn } from "@/lib/utils";
import type { OutboundShipment, ProductCatalogItem } from "@/types/domain";

type GlobalShipmentSearchHit = {
  groupKey: string;
  assignmentNo: string;
  brief: string;
};

function safeOutbound(rows: OutboundShipment[] | undefined | null): OutboundShipment[] {
  return Array.isArray(rows) ? rows : [];
}

function safeCatalog(rows: ProductCatalogItem[] | undefined | null): ProductCatalogItem[] {
  return Array.isArray(rows) ? rows : [];
}

function assignmentGroupKey(sh: OutboundShipment): string {
  return `${sh.legalEntityId}::${sh.assignmentId ?? sh.assignmentNo ?? sh.id}`;
}

function groupMatchesNeedle(
  shipments: OutboundShipment[],
  needle: string,
  byProduct: Map<string, ProductCatalogItem>,
): boolean {
  const n = needle.toLowerCase();
  if (!n) return false;
  const first = shipments[0];
  if (!first) return false;
  const displayNo = String(first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id).toLowerCase();
  if (displayNo.includes(n)) return true;

  for (const sh of shipments) {
    const blob = [
      sh.importBarcode,
      sh.importArticle,
      sh.importName,
      sh.boxBarcode,
      sh.gateBarcode,
      sh.supplyNumber,
      sh.id,
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" ");
    if (blob.includes(n)) return true;
    const boxes = Array.isArray(sh.boxes) ? sh.boxes : [];
    for (const box of boxes) {
      const b = String(box.clientBoxBarcode ?? "").toLowerCase();
      if (b.includes(n)) return true;
      const scanned = Array.isArray(box.scannedBarcodes) ? box.scannedBarcodes : [];
      if (scanned.some((code) => String(code ?? "").toLowerCase().includes(n))) return true;
    }
    const p = byProduct.get(sh.productId);
    if (p) {
      const cat = [p.barcode, p.supplierArticle, p.name].map((x) => String(x ?? "").toLowerCase()).join(" ");
      if (cat.includes(n)) return true;
    }
  }
  return false;
}

function buildHits(
  outbound: OutboundShipment[],
  catalog: ProductCatalogItem[],
  legalEntityId: string,
  needle: string,
): GlobalShipmentSearchHit[] {
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  const rows =
    legalEntityId === "all" ? outbound : outbound.filter((x) => x.legalEntityId === legalEntityId);
  const byProduct = new Map(catalog.map((p) => [p.id, p]));
  const groups = new Map<string, OutboundShipment[]>();
  for (const sh of rows) {
    const k = assignmentGroupKey(sh);
    const prev = groups.get(k) ?? [];
    prev.push(sh);
    groups.set(k, prev);
  }
  const hits: GlobalShipmentSearchHit[] = [];
  const seen = new Set<string>();
  for (const [groupKey, shipments] of groups) {
    if (!groupKey || !Array.isArray(shipments) || shipments.length === 0) continue;
    if (!groupMatchesNeedle(shipments, q, byProduct)) continue;
    if (seen.has(groupKey)) continue;
    seen.add(groupKey);
    const first = shipments[0];
    const assignmentNo = String(first.assignmentNo?.trim() || first.assignmentId?.trim() || first.id);
    const mp = String(first.marketplace ?? "").toUpperCase();
    const wh = String(first.sourceWarehouse ?? "").trim() || "—";
    const lines = shipments.length;
    const brief = `${mp} · ${wh} · ${lines} ${lines === 1 ? "позиция" : "поз."}`;
    hits.push({ groupKey, assignmentNo, brief });
  }
  return hits;
}

const GlobalShipmentSearch = () => {
  const navigate = useNavigate();
  const { legalEntityId } = useAppFilters();
  const { data: outboundRaw } = useOutboundShipments();
  const { data: catalogRaw } = useProductCatalog();
  const { data: entitiesRaw } = useLegalEntities();

  const outbound = React.useMemo(() => safeOutbound(outboundRaw), [outboundRaw]);
  const catalog = React.useMemo(() => safeCatalog(catalogRaw), [catalogRaw]);
  const entities = Array.isArray(entitiesRaw) ? entitiesRaw : [];

  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 400);
    return () => window.clearTimeout(t);
  }, [query]);

  const pending = query.trim() !== debouncedQuery;
  const hits = React.useMemo(
    () => buildHits(outbound, catalog, legalEntityId, debouncedQuery),
    [outbound, catalog, legalEntityId, debouncedQuery],
  );

  const showPanel = open && debouncedQuery.length > 0 && !pending;

  React.useEffect(() => {
    if (!showPanel) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showPanel]);

  const go = React.useCallback(
    (groupKey: string) => {
      if (!groupKey) return;
      navigate(`/shipping?openTask=${encodeURIComponent(groupKey)}`);
      setQuery("");
      setDebouncedQuery("");
      setOpen(false);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter" && hits.length === 1) {
      e.preventDefault();
      go(hits[0].groupKey);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative min-w-0 max-w-[min(100%,320px)] flex-1")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск: № задания, штрихкод, артикул"
          className="h-9 border-slate-200 pl-8 text-sm"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? "global-shipment-search-results" : undefined}
        />
      </div>
      {showPanel ? (
        <div
          id="global-shipment-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {hits.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-600">Ничего не найдено</div>
          ) : (
            hits.map((h) => {
              const sep = h.groupKey.indexOf("::");
              const leId = sep >= 0 ? h.groupKey.slice(0, sep) : "";
              const leName = entities.find((e) => e.id === leId)?.shortName ?? "";
              const sub = leName ? `${leName} · ${h.brief}` : h.brief;
              return (
                <button
                  key={h.groupKey}
                  type="button"
                  role="option"
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => go(h.groupKey)}
                >
                  <span className="font-medium tabular-nums text-slate-900">№ {h.assignmentNo}</span>
                  <span className="text-xs text-slate-600">{sub}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
};

export default GlobalShipmentSearch;
