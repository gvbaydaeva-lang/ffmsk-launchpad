import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, Truck, Wallet } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/warehouse", label: "Склад", icon: Package },
  { to: "/finance", label: "Финансы", icon: Wallet },
  { to: "/shipping", label: "Отгрузка", icon: Truck },
] as const;

function matchNav(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

const AppShellLayout = () => {
  const { pathname } = useLocation();
  const current = nav.find((item) => matchNav(pathname, item.to, item.end));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
          <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gradient font-display text-sm font-bold text-accent-foreground shadow-glow">
              F
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate font-display text-sm font-semibold tracking-tight">FFMSK</div>
              <div className="truncate text-xs text-muted-foreground">Склад · Финансы · Отгрузки</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Разделы</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const Icon = item.icon;
                  const active = matchNav(pathname, item.to, item.end);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to} end={item.end}>
                          <Icon />
                          <span>{item.label}</span>
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
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
          <SidebarTrigger className="-ml-0.5" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-foreground md:text-base">
              {current?.label ?? "Кабинет"}
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Остатки FIFO · операции по маркетплейсам · коробы и экспорт
            </p>
          </div>
        </header>
        <div className={cn("flex flex-1 flex-col gap-6 p-4 pb-10 md:p-6")}>
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppShellLayout;
