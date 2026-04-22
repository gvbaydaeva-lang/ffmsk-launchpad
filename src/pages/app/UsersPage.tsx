import * as React from "react";
import { Plus, UserPlus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLegalEntities, useOrgUsers } from "@/hooks/useWmsMock";
import type { OrgUser } from "@/types/domain";

const roleVariant: Record<OrgUser["role"], "default" | "secondary" | "outline"> = {
  Администратор: "default",
  Склад: "secondary",
  Финансы: "outline",
  "Только чтение": "outline",
};

const UsersPage = () => {
  const { data: users, isLoading: uLoad, error: uErr, addUser, isAdding } = useOrgUsers();
  const { data: legals } = useLegalEntities();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    email: "",
    displayName: "",
    role: "Склад" as OrgUser["role"],
    legalEntityId: "",
  });

  React.useEffect(() => {
    if (legals?.length) {
      setForm((f) => (f.legalEntityId ? f : { ...f, legalEntityId: legals[0]!.id }));
    }
  }, [legals]);

  const legalName = (id: string) => legals?.find((l) => l.id === id)?.shortName ?? id;

  const onAdd = async () => {
    if (!form.email.trim() || !form.displayName.trim() || !form.legalEntityId) {
      toast.error("Заполните поля");
      return;
    }
    try {
      await addUser({
        email: form.email.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        role: form.role,
        legalEntityId: form.legalEntityId,
      });
      toast.success("Пользователь добавлен");
      setOpen(false);
      setForm((f) => ({ email: "", displayName: "", role: "Склад", legalEntityId: f.legalEntityId }));
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Пользователи</h2>
          <p className="mt-1 text-sm text-muted-foreground">Роли и привязка к юридическому лицу.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start">
              <Plus className="h-4 w-4" />
              Добавить пользователя
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Новый пользователь
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="em">Email</Label>
                <Input
                  id="em"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dn">Имя</Label>
                <Input id="dn" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Роль</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as OrgUser["role"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Администратор">Администратор</SelectItem>
                    <SelectItem value="Склад">Склад</SelectItem>
                    <SelectItem value="Финансы">Финансы</SelectItem>
                    <SelectItem value="Только чтение">Только чтение</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Юрлицо</Label>
                <Select value={form.legalEntityId} onValueChange={(v) => setForm((f) => ({ ...f, legalEntityId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {legals?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.shortName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <CardTitle className="font-display text-lg">Список доступа</CardTitle>
          <CardDescription>Email, роль, организация</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {uLoad ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : uErr ? (
            <p className="p-6 text-sm text-destructive">Ошибка загрузки.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Имя</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Юрлицо</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{u.email}</TableCell>
                      <TableCell>{u.displayName}</TableCell>
                      <TableCell>
                        <Badge variant={roleVariant[u.role]}>{u.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{legalName(u.legalEntityId)}</TableCell>
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

export default UsersPage;
