import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShellLayout from "./layouts/AppShellLayout.tsx";
import DashboardPage from "./pages/app/DashboardPage.tsx";
import ReceivingPage from "./pages/app/ReceivingPage.tsx";
import ShippingPage from "./pages/app/ShippingPage.tsx";
import WarehousePage from "./pages/app/WarehousePage.tsx";
import FinancePage from "./pages/app/FinancePage.tsx";
import LegalEntitiesPage from "./pages/app/LegalEntitiesPage.tsx";
import UsersPage from "./pages/app/UsersPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const routerBasename =
  import.meta.env.BASE_URL.length > 1 ? import.meta.env.BASE_URL.replace(/\/$/, "") : undefined;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route path="/" element={<AppShellLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="receiving" element={<ReceivingPage />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="warehouse" element={<WarehousePage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="legal-entities" element={<LegalEntitiesPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
