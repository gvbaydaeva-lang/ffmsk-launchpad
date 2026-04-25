import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";
import { useLegalEntities, useOutboundShipments } from "@/hooks/useWmsMock";

const PackingPage = () => {
  const { data: outbound, isLoading, error } = useOutboundShipments();
  const { data: legal } = useLegalEntities();
  const { legalEntityId } = useAppFilters();
  const [selectedShipmentId, setSelectedShipmentId] = React.useState("");

  const activeShipments = React.useMemo(() => {
    const rows = outbound ?? [];
    return rows
      .filter((x) => x.status !== "отгружено")
      .filter((x) => legalEntityId === "all" || x.legalEntityId === legalEntityId)
      .sort((a, b) => (a.assignmentNo || "").localeCompare(b.assignmentNo || "", "ru"));
  }, [outbound, legalEntityId]);

  const selected = activeShipments.find((x) => x.id === selectedShipmentId) ?? null;
  const entityName = selected ? legal?.find((x) => x.id === selected.legalEntityId)?.shortName ?? selected.legalEntityId : "";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Рабочее место упаковщика</h2>
        <p className="mt-1 text-sm text-slate-600">Изолированный модуль физической упаковки и сканирования отгрузок.</p>
      </div>

      <GlobalFiltersBar />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Выберите задание на отгрузку</CardTitle>
          <CardDescription>Показываются только активные задания, которые еще не отгружены.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Не удалось загрузить список отгрузок.</p>
          ) : (
            <>
              <Select value={selectedShipmentId} onValueChange={setSelectedShipmentId}>
                <SelectTrigger className="w-full max-w-2xl">
                  <SelectValue placeholder={activeShipments.length ? "Выберите отгрузку" : "Активных отгрузок нет"} />
                </SelectTrigger>
                <SelectContent>
                  {activeShipments.map((row) => {
                    const labelEntity = legal?.find((x) => x.id === row.legalEntityId)?.shortName ?? row.legalEntityId;
                    const labelTask = row.assignmentNo?.trim() ? `Задание ${row.assignmentNo}` : "Без номера задания";
                    return (
                      <SelectItem key={row.id} value={row.id}>
                        {labelTask} · {labelEntity} · {row.sourceWarehouse} · план {row.plannedUnits}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">{selected ? `Выбрано: ${selected.assignmentNo || selected.id}` : "Задание не выбрано"}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {selected
                    ? `${entityName} · ${selected.sourceWarehouse} · план ${selected.plannedUnits} шт.`
                    : "Выберите задание, чтобы перейти к следующему шагу упаковки."}
                </p>
              </div>

              <Button size="lg" className="h-12 w-full max-w-sm text-base" disabled={!selected}>
                Начать упаковку
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PackingPage;
