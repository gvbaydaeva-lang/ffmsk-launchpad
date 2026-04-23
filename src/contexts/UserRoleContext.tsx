import * as React from "react";

export type UserRole = "ADMIN" | "WAREHOUSE" | "CLIENT";

type UserRoleContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
};

const UserRoleContext = React.createContext<UserRoleContextValue | null>(null);

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<UserRole>("ADMIN");
  const value = React.useMemo(() => ({ role, setRole }), [role]);
  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

export function useUserRole() {
  const ctx = React.useContext(UserRoleContext);
  if (!ctx) throw new Error("useUserRole must be used within UserRoleProvider");
  return ctx;
}

export function canCreateInbound(role: UserRole) {
  return role === "ADMIN" || role === "CLIENT";
}

export function canCreateOutbound(role: UserRole) {
  return role === "ADMIN" || role === "WAREHOUSE";
}

export function canChangeInboundStatus(role: UserRole) {
  return role === "ADMIN" || role === "WAREHOUSE";
}

export function canChangeOutboundStatus(role: UserRole) {
  return role === "ADMIN" || role === "WAREHOUSE";
}

export function canEditCatalog(role: UserRole) {
  return role === "ADMIN";
}

export function canEditTariffs(role: UserRole) {
  return role === "ADMIN";
}
