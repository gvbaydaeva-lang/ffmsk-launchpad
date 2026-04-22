import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShellLayout from "./layouts/AppShellLayout.tsx";
import DashboardPage from "./pages/app/DashboardPage.tsx";
import PlaceholderPage from "./pages/app/PlaceholderPage.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

/** Корень GitHub Pages — подпапка репозитория (см. vite.config base) */
const routerBasename =
  import.meta.env.BASE_URL.length > 1 ? import.meta.env.BASE_URL.replace(/\/$/, "") : undefined;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<AppShellLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="warehouse" element={<PlaceholderPage title="Склад" />} />
            <Route path="receiving" element={<PlaceholderPage title="Приёмка" />} />
            <Route path="shipping" element={<PlaceholderPage title="Отгрузка" />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
