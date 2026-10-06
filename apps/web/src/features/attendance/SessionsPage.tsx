import { useState } from "react";
import { useAuth } from "../auth/session";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Feedback } from "../../shared/ui/Feedback";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { SessionForm } from "./SessionForm";
import { GroupContext } from "./GroupContext";
import {
  sessionDate,
  sessionStates,
  sessionTime,
  type SessionsPageData,
} from "./model";

export function SessionsPage({
  id,
  query,
}: {
  id: string;
  query: URLSearchParams;
}) {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const reader = session.user.roles.some((role) =>
    ["ADMIN", "SECRETARIA", "COORDINADOR"].includes(role),
  );
  const back = reader
    ? `${admin ? "/configuracion" : "/consulta"}/grupos`
    : "/mis-grupos/grupos";
  const path = `/asistencia/grupos/${id}`;
  const endpoint = `asistencia/grupos/${id}/sesiones`;
  const after = query.get("after") ?? "";
  const search = new URLSearchParams({ limit: "20" });
  if (after) search.set("after", after);
  const {
    data: loaded,
    loading,
    error,
    reload,
  } = useApiQuery<SessionsPageData>(`${endpoint}?${search}`);
  // No presentar el grupo anterior mientras la nueva consulta se resuelve.
  const data = !error && loaded?.grupo.id === id ? loaded : undefined;
  const group = data?.grupo;
  const [creating, create] = useState(false);
  const [success, notify] = useState("");
  return (
    <section>
      <a href={`#${back}`} className="back-link">
        ← Volver a grupos
      </a>
      <PageHeading
        eyebrow="Asistencia"
        title="Sesiones de clase"
        description="Programa las fechas de clase del grupo para el registro de asistencia."
        action={
          data?.puedeProgramar && (
            <Button
              variant="primary"
              disabled={loading || !!error}
              onClick={() => {
                notify("");
                create(true);
              }}
            >
              Programar sesiones
            </Button>
          )
        }
      />
      {group && <GroupContext group={group} />}
      {data && !data.puedeProgramar && (
        <p className="readonly">
          Solo lectura ·{" "}
          {group?.asistencia_cerrada || group?.periodo_estado === "CERRADO"
            ? "El grupo o periodo está cerrado."
            : "Tu cuenta puede consultar las sesiones de este grupo."}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando sesiones…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription={
          after
            ? "No hay más sesiones en esta página. Vuelve a la primera página."
            : data?.puedeProgramar
              ? "Programa las primeras fechas de clase de este grupo."
              : "Todavía no hay sesiones programadas para este grupo."
        }
        pagination={
          <Pagination
            count={data?.items.length ?? 0}
            after={after}
            nextCursor={data?.nextCursor ?? null}
            onChange={(cursor) =>
              navigate(cursor ? `${path}?after=${cursor}` : path)
            }
          />
        }
      >
        <DataTable
          caption="Sesiones del grupo"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "fecha",
              header: "Fecha de clase",
              cell: (row) => sessionDate(row.fecha),
            },
            {
              key: "horario",
              header: "Horario",
              cell: (row) => sessionTime(row.hora_inicio, row.hora_fin),
            },
            {
              key: "estado",
              header: "Estado",
              cell: (row) => (
                <StatusBadge inactive={row.estado === "CANCELADA"}>
                  {sessionStates[row.estado]}
                </StatusBadge>
              ),
            },
            {
              key: "acciones",
              header: "Acciones",
              cell: (row) => (
                <a href={`#${path}/sesiones/${row.id}`}>Asistencia</a>
              ),
            },
          ]}
        />
      </ListPanel>
      {creating && group && data?.puedeProgramar && (
        <SessionForm
          group={group}
          endpoint={endpoint}
          onClose={() => create(false)}
          onSaved={(count) => {
            create(false);
            notify(
              count === 1
                ? "Se programó 1 sesión."
                : `Se programaron ${count} sesiones.`,
            );
            if (after) navigate(path);
            else reload();
          }}
        />
      )}
    </section>
  );
}
