import * as React from "react";
import { MapPinned, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useLocations } from "@/hooks/useWmsMock";

const LOCATION_TYPE_LABEL: Record<"storage" | "receiving" | "shipping", string> = {
  storage: "Хранение",
  receiving: "Приёмка",
  shipping: "Отгрузка",
};

const LocationsPage = () => {
  const { data, isLoading, error, addLocation, isAddingLocation } = useLocations();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"storage" | "receiving" | "shipping">("storage");

  const rows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Название обязательно");
      return;
    }
    try {
      await addLocation({ name: trimmed, type });
      setName("");
      setType("storage");
      setOpen(false);
      toast.success("Место добавлено");
    } catch {
      toast.error("Не удалось добавить место");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Места хранения</h2>
          <p className="mt-1 text-sm text-slate-600">Справочник складских зон и ячеек.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start bg-slate-900 text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              Добавить место
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPinned className="h-5 w-5" />
                Новое место
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="location-name">Название</Label>
                <Input
                  id="location-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A-01"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Тип</Label>
                <Select value={type} onValueChange={(v) => setType(v as "storage" | "receiving" | "shipping")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="storage">Хранение</SelectItem>
                    <SelectItem value="receiving">Приёмка</SelectItem>
                    <SelectItem value="shipping">Отгрузка</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void onSubmit()} disabled={isAddingLocation}>
                {isAddingLocation ? "Сохранение..." : "Добавить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg text-slate-900">Список мест</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Не удалось загрузить места хранения.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">Список мест пуст.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600">Название</TableHead>
                  <TableHead className="text-slate-600">Тип</TableHead>
                  <TableHead className="text-slate-600">Склад</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-slate-100">
                    <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                    <TableCell>{LOCATION_TYPE_LABEL[row.type]}</TableCell>
                    <TableCell>{row.warehouseId?.trim() || "—"}</TableCell>
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

export default LocationsPage;

