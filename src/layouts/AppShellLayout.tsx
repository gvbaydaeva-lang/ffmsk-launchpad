import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Box,
  Building2,
  History,
  LayoutDashboard,
  Package,
  PackageOpen,
  ScanLine,
  ScanBarcode,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useScanner } from "@/contexts/ScannerContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useInboundSupplies, useOutboundShipments } from "@/hooks/useWmsMock";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard, end: true },
  { to: "/warehouse", label: "Складской учёт", icon: Package },
  { to: "/receiving", label: "Приёмка", icon: PackageOpen },
  { to: "/shipping", label: "Отгрузки", icon: Truck },
  { to: "/packing", label: "Упаковщик", icon: ScanBarcode },
  { to: "/history", label: "История операций", icon: History },
  { to: "/finance", label: "Финансы", icon: Wallet },
  { to: "/legal-entities", label: "Юрлица", icon: Building2 },
  { to: "/users", label: "Пользователи", icon: Users },
] as const;

function matchNav(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

const AppShellLayout = () => {
  const { pathname } = useLocation();
  const current = nav.find((item) => matchNav(pathname, item.to, item.end));
  const { openScanner } = useScanner();
  const { role, setRole } = useUserRole();
  const { data: inbound } = useInboundSupplies();
  const { data: outbound } = useOutboundShipments();

  const inboundBadge = (inbound ?? []).filter((x) => x.status !== "принято").length;
  const outboundBadge = (() => {
    const rows = outbound ?? [];
    const activeAssignments = new Set<string>();
    for (const row of rows) {
      const plan = Number(row.plannedUnits) || 0;
      const fact = Number(row.packedUnits ?? row.shippedUnits ?? 0) || 0;
      const isActive = row.status !== "отгружено" && fact < plan;
      if (!isActive) continue;
      const assignmentKey = `${row.legalEntityId}::${row.assignmentId ?? row.assignmentNo ?? row.id}`;
      activeAssignments.add(assignmentKey);
    }
    return activeAssignments.size;
  })();

  const navBadge = (to: string) => {
    if (to === "/receiving") return inboundBadge;
    if (to === "/packing") return outboundBadge;
    return 0;
  };

  return (
    <SidebarProvider
      className={cn(
        "[--sidebar-background:222.2_47.4%_11.2%] [--sidebar-foreground:210_40%_98%] [--sidebar-primary:160_84%_39%] [--sidebar-primary-foreground:0_0%_100%] [--sidebar-accent:217_33%_17%] [--sidebar-accent-foreground:210_40%_98%] [--sidebar-border:217_33%_17%] [--sidebar-ring:160_84%_39%]",
      )}
    >
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="border-b border-white/10 px-3 py-4">
          <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
              <Box className="h-4 w-4" />
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold tracking-tight text-white">Fulfillment ERP</div>
              <div className="truncate text-xs text-slate-400">B2B</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="text-slate-100">
          <SidebarGroup>
            <SidebarGroupLabel className="text-slate-500">Меню</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const Icon = item.icon;
                  const active = matchNav(pathname, item.to, item.end);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          "text-slate-200 data-[active=true]:bg-white/10 data-[active=true]:text-white hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <NavLink to={item.to} end={item.end}>
                          <Icon />
                          <span>{item.label}</span>
                          {navBadge(item.to) > 0 ? (
                            <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                              {navBadge(item.to)}
                            </span>
                          ) : null}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarRail />
      <SidebarInset className="bg-slate-50">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:px-4">
          <SidebarTrigger className="-ml-0.5 text-slate-700" />
          <Separator orientation="vertical" className="mr-1 h-6 bg-slate-200" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-slate-900 md:text-base">{current?.label ?? "Кабинет"}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">Операционный кабинет</p>
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">ADMIN</SelectItem>
              <SelectItem value="WAREHOUSE">WAREHOUSE</SelectItem>
              <SelectItem value="CLIENT">CLIENT</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex shrink-0 gap-2 border-slate-200 bg-white shadow-none"
            onClick={() => openScanner()}
          >
            <ScanLine className="h-4 w-4 text-slate-600" />
            Сканер
            <kbd className="pointer-events-none rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
              /
            </kbd>
          </Button>
        </header>
        <div className={cn("flex flex-1 flex-col gap-6 p-4 pb-10 md:p-6")}>
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppShellLayout;
