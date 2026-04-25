import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { EXCEL_TABLE_BASE, EXCEL_TABLE_WRAP, STATIC_HEADER_BASE, excelRowBg } from "@/lib/excelTableStyles";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useInboundSupplies, useLegalEntities } from "@/hooks/useWmsMock";
import { filterInboundByMarketplace } from "@/services/mockReceiving";
import type { Marketplace } from "@/types/domain";

const ReceivingPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useInboundSupplies();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<"entity" | "planned" | "fact">("entity");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const rows = React.useMemo(() => {
    const base = filterInboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((r) => r.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);
  const summaryRows = React.useMemo(() => {
    const grouped = new Map<string, { legalEntityId: string; planned: number; fact: number; warehouses: Set<string>; statuses: Set<string> }>();
    for (const r of rows) {
      const cur = grouped.get(r.legalEntityId) ?? {
        legalEntityId: r.legalEntityId,
        planned: 0,
        fact: 0,
        warehouses: new Set<string>(),
        statuses: new Set<string>(),
      };
      cur.planned += r.items.reduce((s, it) => s + it.plannedQuantity, 0);
      cur.fact += r.items.reduce((s, it) => s + it.factualQuantity, 0);
      cur.warehouses.add(r.destinationWarehouse);
      cur.statuses.add(r.status);
      grouped.set(r.legalEntityId, cur);
    }
    const arr = Array.from(grouped.values()).map((x) => ({
      ...x,
      entity: entityName(x.legalEntityId),
    }));
    const s = search.trim().toLowerCase();
    const filteredRows = arr.filter((r) => !s || r.entity.toLowerCase().includes(s));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (sortKey === "planned") return (a.planned - b.planned) * dir;
      if (sortKey === "fact") return (a.fact - b.fact) * dir;
      return a.entity.localeCompare(b.entity, "ru") * dir;
    });
  }, [rows, entityName, search, sortDir, sortKey]);
  const onSort = (key: "entity" | "planned" | "fact") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  React.useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
    void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: ["wms", "inbound"] });
      void queryClient.invalidateQueries({ queryKey: ["wms", "outbound"] });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);


  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Приёмка</h2>
          <p className="mt-1 text-sm text-slate-600">Входящие поставки по маркетплейсам и юрлицам.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: название, баркод, артикул"
            className="w-full sm:w-[280px]"
          />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[200px]">
              <SelectValue placeholder="Площадка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Поставки</CardTitle>
          <CardDescription className="text-slate-500">Статусы: ожидается → на приёмке → принято</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить список.</p>
          ) : (
            <div className={EXCEL_TABLE_WRAP}>
              <table className={EXCEL_TABLE_BASE}>
                <thead>
                  <tr>
                    <th
                      className={`${STATIC_HEADER_BASE} min-w-[160px] cursor-pointer whitespace-nowrap`}
                      onClick={() => onSort("entity")}
                    >
                      Юрлицо
                    </th>
                    <th
                      className={`${STATIC_HEADER_BASE} w-[120px] cursor-pointer text-right tabular-nums`}
                      onClick={() => onSort("planned")}
                    >
                      План
                    </th>
                    <th
                      className={`${STATIC_HEADER_BASE} w-[120px] cursor-pointer text-right tabular-nums`}
                      onClick={() => onSort("fact")}
                    >
                      Факт
                    </th>
                    <th className={`${STATIC_HEADER_BASE} min-w-[140px] whitespace-nowrap`}>Склад</th>
                    <th className={`${STATIC_HEADER_BASE} min-w-[120px]`}>Статусы</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row, idx) => {
                    const bg = excelRowBg(idx, false);
                    const cell = `border-b border-r border-slate-200 px-1.5 py-0.5 align-middle text-[11px] ${bg}`;
                    return (
                      <tr key={row.legalEntityId}>
                        <td className={`${cell} max-w-[220px]`}>
                          <Link
                            to={`/legal-entities/${row.legalEntityId}?tab=receiving`}
                            className="block whitespace-nowrap font-medium text-slate-900 hover:underline"
                          >
                            {row.entity}
                          </Link>
                        </td>
                        <td className={`${cell} text-right tabular-nums font-medium`}>{row.planned}</td>
                        <td className={`${cell} text-right tabular-nums`}>{row.fact}</td>
                        <td className={`${cell} whitespace-nowrap`}>{Array.from(row.warehouses).join(", ")}</td>
                        <td className={cell}>{Array.from(row.statuses).join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceivingPage;
