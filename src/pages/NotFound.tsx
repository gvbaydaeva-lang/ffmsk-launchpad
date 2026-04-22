import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: маршрут не найден:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6">
      <div className="text-center">
        <h1 className="mb-2 font-display text-4xl font-bold tracking-tight">404</h1>
        <p className="mb-6 text-muted-foreground">Страница не существует</p>
        <Button asChild>
          <Link to="/receiving">В кабинет</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
