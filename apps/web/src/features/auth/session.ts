import { createContext, useContext } from "react";
import type { Session } from "../../shared/api";
export type Access = {
  session: Session;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  changedPassword: () => void;
};
export const Context = createContext<Access | null>(null);
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Falta sesión");
  return value;
}
