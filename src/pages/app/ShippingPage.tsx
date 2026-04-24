import * as React from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useLegalEntities, useOutboundShipments } from "@/hooks/useWmsMock";
import { filterOutboundByMarketplace } from "@/services/mockOutbound";
import type { Marketplace } from "@/types/domain";

const ShippingPage = () => {
  const { data, isLoading, error } = useOutboundShipments();
  const { data: entities } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  useUserRole();
  const [mp, setMp] = React.useState<Marketplace | "all">("all");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<"entity" | "planned" | "fact" | "reserved">("entity");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const filtered = React.useMemo(() => {
    const base = filterOutboundByMarketplace(data ?? [], mp);
    if (legalEntityId === "all") return base;
    return base.filter((x) => x.legalEntityId === legalEntityId);
  }, [data, mp, legalEntityId]);
  const summaryRows = React.useMemo(() => {
    const grouped = new Map<
      string,
      {
        legalEntityId: string;
        assignmentKey: string;
        assignmentLabel: string;
        planned: number;
        fact: number;
        reserved: number;
        warehouses: Set<string>;
        statuses: Set<string>;
      }
    >();
    for (const x of filtered) {
      const assignmentKey = x.assignmentId ?? "legacy";
      const groupId = `${x.legalEntityId}|${assignmentKey}`;
      const assignmentLabel = x.assignmentNo?.trim() || (x.assignmentId ? "Задание" : "—");
      const cur = grouped.get(groupId) ?? {
        legalEntityId: x.legalEntityId,
        assignmentKey,
        assignmentLabel,
        planned: 0,
        fact: 0,
        reserved: 0,
        warehouses: new Set<string>(),
        statuses: new Set<string>(),
      };
      cur.planned += x.plannedUnits;
      cur.fact += x.shippedUnits ?? 0;
      if (x.status === "готов к отгрузке (резерв)") cur.reserved += x.plannedUnits;
      cur.warehouses.add(x.sourceWarehouse);
      cur.statuses.add(x.status);
      grouped.set(groupId, cur);
    }
    const arr = Array.from(grouped.values()).map((g) => ({
      ...g,
      entity: entities?.find((e) => e.id === g.legalEntityId)?.shortName ?? g.legalEntityId,
    }));
    const s = search.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;
    return arr
      .filter((r) => !s || r.entity.toLowerCase().includes(s) || r.assignmentLabel.toLowerCase().includes(s))
      .sort((a, b) => {
        if (sortKey === "planned") return (a.planned - b.planned) * dir;
        if (sortKey === "fact") return (a.fact - b.fact) * dir;
        if (sortKey === "reserved") return (a.reserved - b.reserved) * dir;
        return a.entity.localeCompare(b.entity, "ru") * dir;
      });
  }, [entities, filtered, search, sortDir, sortKey]);
  const onSort = (key: "entity" | "planned" | "fact" | "reserved") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Отгрузка</h2>
          <p className="mt-1 text-sm text-slate-600">Задания на выдачу со склада FF и контроль остатков.</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: юрлицо" className="w-[250px]" />
          <Select value={mp} onValueChange={(v) => setMp(v as Marketplace | "all")}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все площадки</SelectItem>
              <SelectItem value="wb">Wildberries</SelectItem>
              <SelectItem value="ozon">Ozon</SelectItem>
              <SelectItem value="yandex">Яндекс.Маркет</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" disabled>
            <Download className="h-4 w-4" />
            Экспорт shk-excel
          </Button>
        </div>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Отгрузки</CardTitle>
          <CardDescription className="text-slate-500">Статусы: создано → к отгрузке → отгружено</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить отгрузки.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => onSort("entity")}>
                    Юрлицо
                  </TableHead>
                  <TableHead>Номер задания</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => onSort("planned")}>
                    Общее кол-во
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => onSort("fact")}>
                    Факт отгрузки
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => onSort("reserved")}>
                    В резерве
                  </TableHead>
                  <TableHead>Склад</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={`${row.legalEntityId}-${row.assignmentKey}`}>
                    <TableCell>
                      <Link to={`/legal-entities/${row.legalEntityId}?tab=shipping`} className="font-medium hover:underline">
                        {row.entity}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.assignmentLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.planned}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.fact}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reserved}</TableCell>
                    <TableCell>{Array.from(row.warehouses).join(", ")}</TableCell>
                    <TableCell>{Array.from(row.statuses).join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ShippingPage;
