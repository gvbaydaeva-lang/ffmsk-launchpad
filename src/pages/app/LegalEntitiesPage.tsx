import * as React from "react";
import { Building2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLegalEntities } from "@/hooks/useWmsMock";

const LegalEntitiesPage = () => {
  const { data, isLoading, error, addEntity, isAdding } = useLegalEntities();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    shortName: "",
    fullName: "",
    inn: "",
    kpp: "",
    ogrn: "",
    isActive: true,
  });

  const onAdd = async () => {
    if (!form.shortName.trim() || !form.fullName.trim() || !form.inn.trim() || !form.ogrn.trim()) {
      toast.error("Заполните обязательные поля");
      return;
    }
    try {
      await addEntity({
        shortName: form.shortName.trim(),
        fullName: form.fullName.trim(),
        inn: form.inn.trim(),
        kpp: form.kpp.trim(),
        ogrn: form.ogrn.trim(),
        isActive: form.isActive,
      });
      toast.success("Юридическое лицо добавлено");
      setOpen(false);
      setForm({ shortName: "", fullName: "", inn: "", kpp: "", ogrn: "", isActive: true });
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Юридические лица</h2>
          <p className="mt-1 text-sm text-muted-foreground">Карточки организаций для договоров и отчётности.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              Добавить юрлицо
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Новая организация
              </DialogTitle>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-2 pr-1">
              <div className="grid gap-1.5">
                <Label htmlFor="sn">Краткое наименование</Label>
                <Input
                  id="sn"
                  value={form.shortName}
                  onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  placeholder="ООО «…»"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fn">Полное наименование</Label>
                <Input
                  id="fn"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="inn">ИНН</Label>
                  <Input id="inn" value={form.inn} onChange={(e) => setForm((f) => ({ ...f, inn: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kpp">КПП</Label>
                  <Input id="kpp" value={form.kpp} onChange={(e) => setForm((f) => ({ ...f, kpp: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ogrn">ОГРН / ОГРНИП</Label>
                <Input id="ogrn" value={form.ogrn} onChange={(e) => setForm((f) => ({ ...f, ogrn: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/80 p-3">
                <Label htmlFor="active">Активна</Label>
                <Switch id="active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={onAdd} disabled={isAdding}>
                {isAdding ? "Сохранение…" : "Добавить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/80 shadow-elegant">
        <CardHeader>
          <CardTitle className="font-display text-lg">Список</CardTitle>
          <CardDescription>ИНН, КПП, статус</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Ошибка загрузки.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Краткое имя</TableHead>
                    <TableHead className="font-mono">ИНН</TableHead>
                    <TableHead className="font-mono">КПП</TableHead>
                    <TableHead className="font-mono">ОГРН</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[220px] font-medium">{e.shortName}</TableCell>
                      <TableCell className="font-mono text-xs">{e.inn}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.kpp || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.ogrn}</TableCell>
                      <TableCell>
                        <Badge variant={e.isActive ? "default" : "secondary"}>{e.isActive ? "Активна" : "Неактивна"}</Badge>
                      </TableCell>
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

export default LegalEntitiesPage;
