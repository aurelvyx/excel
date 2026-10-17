import { useAuth } from "../auth/session";

export function ReportLink({ groupId }: { groupId: string | number }) {
  const { session } = useAuth();
  return session.user.roles.some((role) =>
    ["ADMIN", "COORDINADOR", "DOCENTE"].includes(role),
  ) ? (
    <a href={`#/reportes/grupos/${groupId}`}>Reportes</a>
  ) : null;
}
