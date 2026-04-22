import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

/** Корень сайта: без сессии → Login, с сессией → Dashboard */
const RootEntry = () => {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" aria-label="Загрузка" />
      </div>
    );
  }

  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

export default RootEntry;
