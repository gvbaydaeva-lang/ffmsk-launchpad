import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlobalFiltersBar from "@/components/app/GlobalFiltersBar";
import { useAppFilters } from "@/contexts/AppFiltersContext";

/** Отдельный модуль упаковщика: при выбранном юрлице — экран клиента с вкладкой «Упаковщик». */
const PackerPage = () => {
  const { legalEntityId } = useAppFilters();

  if (legalEntityId !== "all") {
    return <Navigate to={`/legal-entities/${legalEntityId}?tab=packer`} replace />;
  }

  return (
    <div className="space-y-4">
      <GlobalFiltersBar />
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Упаковщик</h2>
        <p className="mt-1 text-sm text-slate-600">Сканирование в короба и поля поставки по клиенту.</p>
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Выберите юрлицо</CardTitle>
          <CardDescription>
            В общей шапке приложения укажите клиента — откроется карточка юрлица с модулем упаковщика. Или перейдите из списка юрлиц.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/legal-entities" className="text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
            К списку юрлиц
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default PackerPage;
