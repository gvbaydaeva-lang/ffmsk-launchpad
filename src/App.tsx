import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShellLayout from "./layouts/AppShellLayout.tsx";
import SectionPlaceholderPage from "./pages/app/SectionPlaceholderPage.tsx";
import WarehousePage from "./pages/app/WarehousePage.tsx";
import ShippingPage from "./pages/app/ShippingPage.tsx";
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
            <Route index element={<Navigate to="/receiving" replace />} />
            <Route path="receiving" element={<SectionPlaceholderPage title="Приёмка" />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="warehouse" element={<WarehousePage />} />
            <Route path="legal-entities" element={<SectionPlaceholderPage title="Юридические лица" />} />
            <Route path="users" element={<SectionPlaceholderPage title="Пользователи" />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
