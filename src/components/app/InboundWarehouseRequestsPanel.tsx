import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLegalEntities, useProductCatalog, useWarehouseInboundRequests } from "@/hooks/useWmsMock";
import { toast } from "sonner";

type DraftLine = { key: string; productId: string; plannedQty: string };

function formatPlannedDate(value: string): string {
  const t = Date.parse(`${value}T12:00:00`);
  if (!Number.isFinite(t)) return value || "—";
  return format(new Date(t), "dd.MM.yyyy", { locale: ru });
}

const InboundWarehouseRequestsPanel = () => {
  const { data: entities } = useLegalEntities();
  const { data: catalog, isLoading: catalogLoading } = useProductCatalog();
  const { data: inboundList, isLoading: listLoading, error: listError, postInbounds, isPostingInbounds } =
    useWarehouseInboundRequests();

  const [partnerId, setPartnerId] = React.useState("");
  const [plannedDate, setPlannedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>(() => [{ key: `l-${Date.now()}`, productId: "", plannedQty: "" }]);

  const entityName = React.useCallback(
    (id: string) => entities?.find((e) => e.id === id)?.shortName ?? id,
    [entities],
  );

  const productsForPartner = React.useMemo(() => {
    const all = Array.isArray(catalog) ? catalog : [];
    if (!partnerId.trim()) return all;
    const filtered = all.filter((p) => p.legalEntityId === partnerId);
    return filtered.length > 0 ? filtered : all;
  }, [catalog, partnerId]);

  const resetForm = React.useCallback(() => {
    setPartnerId("");
    setPlannedDate(new Date().toISOString().slice(0, 10));
    setComment("");
    setLines([{ key: `l-${Date.now()}`, productId: "", plannedQty: "" }]);
  }, []);

  const addLine = () => {
    setLines((prev) => [...prev, { key: `l-${Date.now()}-${prev.length}`, productId: "", plannedQty: "" }]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<Pick<DraftLine, "productId" | "plannedQty">>) => {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const submit = async () => {
    const items = lines
      .map((l) => ({
        productId: l.productId.trim(),
        plannedQty: Math.trunc(Number(l.plannedQty) || 0),
      }))
      .filter((l) => l.productId && l.plannedQty > 0);

    try {
      await postInbounds({
        partnerId,
        plannedDate,
        comment,
        items,
      });
      toast.success("Заявка на приёмку создана");
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось создать заявку";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Создание заявки на приёмку</CardTitle>
          <CardDescription className="text-slate-500">
            План поступления (POST /inbounds). Партнёр — юрлицо из справочника; товары — из каталога. Не создаёт складскую задачу приёмки автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Партнёр</Label>
              <Select value={partnerId || undefined} onValueChange={setPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите партнёра" />
                </SelectTrigger>
                <SelectContent>
                  {(entities ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ожидаемая дата</Label>
              <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Необязательно" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="mb-0">Позиции</Label>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" />
                Добавить строку
              </Button>
            </div>
            {!partnerId ? (
              <p className="text-xs text-amber-800">Сначала выберите партнёра — будет проще выбрать товары клиента.</p>
            ) : null}
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              {catalogLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : productsForPartner.length === 0 ? (
                <p className="text-sm text-slate-600">В каталоге нет товаров для отображения.</p>
              ) : (
                lines.map((line, idx) => (
                  <div key={line.key} className="grid gap-2 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-7">
                      <Label className="text-xs text-slate-500">Товар {idx + 1}</Label>
                      <Select
                        value={line.productId || undefined}
                        onValueChange={(v) => updateLine(line.key, { productId: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Выберите товар" />
                        </SelectTrigger>
                        <SelectContent>
                          {productsForPartner.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · {p.supplierArticle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs text-slate-500">План, шт.</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-9"
                        value={line.plannedQty}
                        onChange={(e) => updateLine(line.key, { plannedQty: e.target.value })}
                      />
                    </div>
                    <div className="flex md:col-span-2 md:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 text-slate-600"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length <= 1}
                        aria-label="Удалить строку"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <Button type="button" onClick={() => void submit()} disabled={isPostingInbounds || catalogLoading}>
            {isPostingInbounds ? "Создание…" : "Создать приёмку"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Список заявок (GET /inbounds)</CardTitle>
          <CardDescription className="text-slate-500">Созданные заявки хранятся локально в браузере (демо API).</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : listError ? (
            <p className="text-sm text-destructive">Не удалось загрузить список заявок.</p>
          ) : !inboundList?.length ? (
            <p className="text-sm text-slate-600">Заявок пока нет.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/90">
                    <TableHead className="text-xs font-semibold">ID</TableHead>
                    <TableHead className="text-xs font-semibold">Партнёр</TableHead>
                    <TableHead className="text-xs font-semibold">Дата план</TableHead>
                    <TableHead className="text-xs font-semibold">Статус</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Позиций</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inboundList.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs tabular-nums">{row.id}</TableCell>
                      <TableCell className="text-sm">{entityName(row.partnerId)}</TableCell>
                      <TableCell className="text-sm tabular-nums">{formatPlannedDate(row.plannedDate)}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {row.status === "new" ? "Новая" : row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.items.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InboundWarehouseRequestsPanel;
