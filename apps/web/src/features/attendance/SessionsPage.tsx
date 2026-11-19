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
import { safeAttendanceReturnTo, withAttendanceReturn } from "./navigation";
import { SessionCalendar } from "./SessionCalendar";
import { loadAllSessions } from "./sessions-query";
import {
  sessionDate,
  sessionStates,
  sessionTime,
  type SessionsPageData,
} from "./model";

export function SessionsPage({
  id,
  query,
  workspacePath,
  workspaceSessionPath,
}: {
  id: string;
  query: URLSearchParams;
  workspacePath?: (cursor: string) => string;
  workspaceSessionPath?: (sessionId: string) => string;
}) {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const reader = session.user.roles.some((role) =>
    ["ADMIN", "SECRETARIA", "COORDINADOR"].includes(role),
  );
  const returnTo = safeAttendanceReturnTo(query.get("retorno"), id);
  const back =
    returnTo ??
    (reader
      ? `${admin ? "/configuracion" : "/consulta"}/grupos`
      : "/mis-grupos/grupos");
  const path = `/asistencia/grupos/${id}`;
  const endpoint = `asistencia/grupos/${id}/sesiones`;
  const after = query.get("after") ?? "";
  const paginationPath = (cursor: string) =>
    workspacePath?.(cursor) ??
    withAttendanceReturn(cursor ? `${path}?after=${cursor}` : path, returnTo);
  const sessionReturn =
    workspacePath || returnTo ? paginationPath(after) : null;
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
  const [initialDate, selectDate] = useState("");
  const [view, setView] = useState<"table" | "calendar" | "cards">(
    workspacePath ? "calendar" : "table",
  );
  const [calendarVersion, refreshCalendar] = useState(0);
  const [success, notify] = useState("");
  return (
    <section className="workspace-sessions">
      {!workspacePath && (
        <a href={`#${back}`} className="back-link">
          ← Volver a grupos
        </a>
      )}
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
                selectDate("");
                create(true);
              }}
            >
              Programar sesiones
            </Button>
          )
        }
      />
      {group && <GroupContext group={group} />}
      {group && (
        <p className="workspace-tools group-nav-pills">
          <a href={`#${path}/justificaciones`}>Justificaciones</a>
          {" · "}
          <a href={`#${withAttendanceReturn(`${path}/matriz`, sessionReturn)}`}>
            Matriz de asistencia
          </a>
          {" · "}
          <a href={`#${path}/cierre`}>Cierre de asistencia</a>
          {" · "}
          <a href={`#/evaluacion/grupos/${id}`}>Evaluaciones</a>
          {!workspacePath && (
            <>
              {" · "}
              <a href={`#/evaluacion/grupos/${id}/calificaciones`}>
                Calificaciones
              </a>
            </>
          )}
          {" · "}
          <a href={`#/evaluacion/grupos/${id}/acta`}>Resultados y acta</a>
        </p>
      )}
      {data && !data.puedeProgramar && (
        <p className="readonly">
          Solo lectura ·{" "}
          {group?.asistencia_cerrada
            ? "La asistencia del grupo está cerrada."
            : group?.estado === "CERRADO" || group?.periodo_estado === "CERRADO"
              ? "El grupo o periodo está cerrado."
              : "Tu cuenta puede consultar las sesiones de este grupo."}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      {data && (
        <div
          className="workspace-evaluation-tabs"
          aria-label="Vista de sesiones"
        >
          <Button
            onClick={() => setView("calendar")}
            aria-pressed={view === "calendar"}
          >
            Calendario
          </Button>
          <Button
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
          >
            Tarjetas
          </Button>
          <Button
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
          >
            Lista de sesiones
          </Button>
        </div>
      )}
      {view !== "table" && data && (
        <SessionCalendarPanel
          key={`${id}:${calendarVersion}`}
          endpoint={endpoint}
          cards={view === "cards"}
          onCreate={(date) => {
            selectDate(date);
            create(true);
          }}
          sessionHref={(sessionId) =>
            `#${workspaceSessionPath?.(sessionId) ?? withAttendanceReturn(`${path}/sesiones/${sessionId}`, sessionReturn)}`
          }
        />
      )}
      {view === "table" && (
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
              onChange={(cursor) => navigate(paginationPath(cursor))}
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
                  <a
                    href={`#${workspaceSessionPath?.(row.id) ?? withAttendanceReturn(`${path}/sesiones/${row.id}`, sessionReturn)}`}
                  >
                    Asistencia
                  </a>
                ),
              },
            ]}
          />
        </ListPanel>
      )}
      {creating && group && data?.puedeProgramar && (
        <SessionForm
          group={group}
          endpoint={endpoint}
          initialDate={initialDate}
          onClose={() => create(false)}
          onSaved={(count) => {
            create(false);
            selectDate("");
            refreshCalendar((value) => value + 1);
            notify(
              count === 1
                ? "Se programó 1 sesión."
                : `Se programaron ${count} sesiones.`,
            );
            if (after) navigate(paginationPath(""));
            else reload();
          }}
        />
      )}
    </section>
  );
}

function SessionCalendarPanel({
  endpoint,
  cards,
  onCreate,
  sessionHref,
}: {
  endpoint: string;
  cards: boolean;
  onCreate: (date: string) => void;
  sessionHref: (id: string) => string;
}) {
  const { data, loading, error, reload } = useApiQuery(
    endpoint,
    loadAllSessions,
  );
  if (loading) return <p role="status">Cargando calendario completo…</p>;
  if (error || !data)
    return (
      <Feedback onRetry={reload}>
        {error || "No se pudo consultar el calendario."}
      </Feedback>
    );
  return (
    <SessionCalendar
      items={data.items}
      group={data.grupo}
      cards={cards}
      canCreate={data.puedeProgramar}
      onCreate={onCreate}
      sessionHref={sessionHref}
    />
  );
}
