import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppFiltersProvider } from "./contexts/AppFiltersContext.tsx";
import { ScannerProvider } from "./contexts/ScannerContext.tsx";
import { UserRoleProvider } from "./contexts/UserRoleContext.tsx";
import AppShellLayout from "./layouts/AppShellLayout.tsx";
import DashboardPage from "./pages/app/DashboardPage.tsx";
import ReceivingPage from "./pages/app/ReceivingPage.tsx";
import ShippingPage from "./pages/app/ShippingPage.tsx";
import PackingPage from "./pages/app/PackingPage.tsx";
import HistoryOperationsPage from "./pages/app/HistoryOperationsPage.tsx";
import WarehousePage from "./pages/app/WarehousePage.tsx";
import FinancePage from "./pages/app/FinancePage.tsx";
import LegalEntitiesPage from "./pages/app/LegalEntitiesPage.tsx";
import LegalEntityDetailsPage from "./pages/app/LegalEntityDetailsPage.tsx";
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
      <UserRoleProvider>
        <AppFiltersProvider>
          <BrowserRouter basename={routerBasename}>
            <ScannerProvider>
              <Routes>
                <Route path="/" element={<AppShellLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="receiving" element={<ReceivingPage />} />
                  <Route path="shipping" element={<ShippingPage />} />
                  <Route path="packing" element={<PackingPage />} />
                  <Route path="packer" element={<Navigate to="/packing" replace />} />
                  <Route path="history" element={<HistoryOperationsPage />} />
                  <Route path="warehouse" element={<WarehousePage />} />
                  <Route path="finance" element={<FinancePage />} />
                  <Route path="legal-entities" element={<LegalEntitiesPage />} />
                  <Route path="legal-entities/:id" element={<LegalEntityDetailsPage />} />
                  <Route path="users" element={<UsersPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ScannerProvider>
          </BrowserRouter>
        </AppFiltersProvider>
      </UserRoleProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
