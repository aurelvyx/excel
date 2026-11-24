import { useState } from "react";
import {
  Calendar,
  FileCheck,
  FileText,
  GraduationCap,
  Lock,
  Plus,
  Users,
} from "lucide-react";
import type { Access } from "../../app/access";
import { text, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Facts } from "../../shared/ui/Facts";
import { PageHeading } from "../../shared/ui/PageHeading";
import { SessionsPage } from "../attendance/SessionsPage";
import { loadAllSessions } from "../attendance/sessions-query";
import { AttendancePage } from "../attendance/AttendancePage";
import {
  currentClassDate,
  sessionDate,
  sessionStates,
  sessionTime,
} from "../attendance/model";
import { SelectField } from "../../shared/ui/Field";
import { navigate } from "../../shared/navigation";
import { requestPageExit } from "../../shared/useUnsavedChanges";
import { GroupRoster } from "../enrollments/GroupRoster";
import { GradesPage } from "../evaluation/GradesPage";
import type { ActView } from "../evaluation/acts-model";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Button } from "../../shared/ui/Button";
import { AttendanceOverviewPage } from "../attendance/AttendanceOverviewPage";
import { SessionForm } from "../attendance/SessionForm";
import { AttendanceClosureModal } from "./components/AttendanceClosureModal";
import { JustificationsDrawer } from "./components/JustificationsDrawer";
import { WorkspaceSummary } from "./components/WorkspaceSummary";
import "./academic.css";
import "../attendance/attendance.css";

const tabs = [
  { key: "asistencia", label: "Control de asistencia", Icon: Calendar },
  { key: "calificaciones", label: "Calificaciones", Icon: GraduationCap },
  { key: "nomina", label: "Alumnos matriculados", Icon: Users },
] as const;
type AttendanceTool = "justificaciones" | "cierre" | "programar";

/** Navega por el salón sin duplicar la captura, los permisos o el cálculo. */
export function GroupWorkspacePage({
  groupId,
  query,
  access,
}: {
  groupId: string;
  query: URLSearchParams;
  access: Access;
}) {
  const group = useApiQuery<Row>(`oferta/grupos/${groupId}`);
  const sessionsEndpoint = `asistencia/grupos/${groupId}/sesiones`;
  const sessions = useApiQuery(sessionsEndpoint, loadAllSessions);
  const act = useApiQuery<ActView>(`evaluacion/grupos/${groupId}/acta?limit=1`);
  const [panel, setPanel] = useState<AttendanceTool | null>(null);
  const [sessionNotice, notifySessions] = useState("");
  const [captureRevision, refreshCapture] = useState(0);
  const path = `/salones/${groupId}`;
  const available = tabs.filter((tab) => tab.key !== "nomina" || access.reader);
  const active =
    available.find((tab) => tab.key === query.get("tab")) ?? tabs[0];
  const view = query.get("vista");
  const month = query.get("mes");
  const sessionItems = sessions.data?.items ?? [];
  const currentSessions = sessionItems.filter(
    (item) => item.estado !== "CANCELADA",
  );
  const today = currentClassDate();
  const suggestedSession =
    currentSessions.find((item) => item.fecha === today) ??
    currentSessions.at(-1) ??
    sessionItems.at(-1);
  const selectedSession =
    query.get("sesion") ??
    (view === "matriz" || view === "sesiones"
      ? ""
      : (suggestedSession?.id ?? ""));
  function attendancePath({
    session,
    vista,
    mes = month,
    after,
  }: {
    session?: string;
    vista?: "sesiones" | "matriz";
    mes?: string | null;
    after?: string;
  }) {
    const params = new URLSearchParams({ tab: "asistencia" });
    if (session) params.set("sesion", session);
    if (vista) params.set("vista", vista);
    if (mes) params.set("mes", mes);
    if (after) params.set("after", after);
    return `${path}?${params}`;
  }
  const tabPath = (after: string) => {
    if (active.key === "asistencia")
      return selectedSession
        ? attendancePath({ session: selectedSession, after })
        : attendancePath({ vista: "sesiones", after });
    const params = new URLSearchParams({ tab: active.key });
    if (after) params.set("after", after);
    return `${path}?${params}`;
  };
  const sessionPath = (id: string) => attendancePath({ session: id });
  function attendanceChanged() {
    act.reload();
    sessions.reload();
  }
  function closePanel() {
    if (panel === "cierre") sessions.reload();
    refreshCapture((revision) => revision + 1);
    setPanel(null);
    act.reload();
  }
  function openSessionTool(tool: AttendanceTool) {
    requestPageExit(() => {
      if (tool === "programar") notifySessions("");
      refreshCapture((revision) => revision + 1);
      setPanel(tool);
    });
  }

  const rawReturn = query.get("retorno");
  const safeReturn =
    rawReturn &&
    rawReturn.startsWith("/gestion-academica") &&
    !rawReturn.startsWith("//") &&
    !/[\\\s]/.test(rawReturn)
      ? rawReturn
      : null;
  const savedReturn = (() => {
    if (safeReturn || access.teacherOnly) return safeReturn;
    try {
      const saved = window.sessionStorage.getItem(
        "excel:gestion-academica:filters",
      );
      return saved ? `/gestion-academica?${saved}` : null;
    } catch {
      return null;
    }
  })();
  const backHref = access.teacherOnly
    ? "#/docencia/clases"
    : savedReturn
      ? `#${savedReturn}`
      : "#/gestion-academica";

  return (
    <section className="academic-container">
      <a className="back-link" href={backHref}>
        ← {access.teacherOnly ? "Volver a mis clases" : "Volver a salones"}
      </a>
      <PageHeading
        eyebrow="Espacio del grupo"
        title="Salón 360°"
        description="Consulta la asistencia, las notas y las matrículas del grupo según tu rol."
      />
      {group.loading ? (
        <Loading>Cargando salón…</Loading>
      ) : group.error || !group.data ? (
        <Feedback onRetry={group.reload}>
          {group.error || "No se encontró el grupo."}
        </Feedback>
      ) : (
        <>
          <div
            className="academic-card workspace-hero"
            aria-label="Información del salón"
          >
            <div className="workspace-hero-main">
              <div>
                <StatusBadge inactive={group.data.estado === "CERRADO"}>
                  {text(group.data, "codigo")} · {text(group.data, "estado")}
                </StatusBadge>
                <h2>{text(group.data, "contexto.nivel")}</h2>
                <p>
                  Periodo {text(group.data, "contexto.periodo")} · Sección{" "}
                  {text(group.data, "contexto.seccion")}
                </p>
              </div>
              <a
                href={`#/evaluacion/grupos/${groupId}/acta`}
                className="academic-btn-action btn-action-secondary"
              >
                <FileCheck size={14} aria-hidden="true" /> Resultados y acta del
                salón
              </a>
            </div>
            <Facts
              items={[
                ["Grupo", text(group.data, "codigo")],
                ["Idioma", text(group.data, "contexto.idioma")],
                ["Nivel", text(group.data, "contexto.nivel")],
                ["Periodo", text(group.data, "contexto.periodo")],
                ["Turno", text(group.data, "contexto.turno")],
                ["Sección", text(group.data, "contexto.seccion")],
                [
                  "Capacidad",
                  group.data.capacidad == null
                    ? "Sin definir"
                    : String(group.data.capacidad),
                ],
              ]}
            />
          </div>
          {act.loading ? (
            <Loading>Actualizando indicadores académicos…</Loading>
          ) : act.error || !act.data ? (
            <Feedback onRetry={act.reload}>
              {act.error ||
                "No se pudo consultar el resumen académico del salón."}
            </Feedback>
          ) : (
            <WorkspaceSummary
              label="Indicadores académicos del salón"
              items={[
                {
                  label: "Matrículas del nivel",
                  value: act.data.resumen.matriculas,
                  detail: "Intentos activos y cerrados del grupo",
                  tone: "green",
                },
                {
                  label: "Resultados pendientes",
                  value: act.data.resumen.pendientes,
                  detail: "Intentos con datos por completar",
                  tone: act.data.resumen.pendientes ? "amber" : "green",
                },
                {
                  label: "Asistencia",
                  value: act.data.grupo.asistencia_cerrada
                    ? "Cerrada"
                    : "Abierta",
                  detail: "Estado del registro de asistencia",
                  tone: "blue",
                },
                {
                  label: "Acta de evaluación",
                  value: act.data.cierre ? "Cerrada" : "Abierta",
                  detail: act.data.configuracion
                    ? "Criterios aplicados al grupo"
                    : "Criterios pendientes de aplicar",
                  tone: act.data.cierre ? "slate" : "green",
                },
              ]}
            />
          )}
          <nav aria-label="Secciones del salón" className="academic-tabs">
            {available.map(({ key, label, Icon }) => (
              <a
                key={key}
                className={`academic-tab-btn ${active.key === key ? "active" : ""}`}
                aria-current={active.key === key ? "page" : undefined}
                href={`#${path}?tab=${key}`}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </a>
            ))}
          </nav>
          {active.key === "asistencia" && (
            <>
              <section
                className="academic-card attendance-workspace-tools"
                aria-label="Herramientas de asistencia del salón"
              >
                <div className="attendance-workspace-actions">
                  {sessionItems.length ? (
                    <SelectField
                      label="Sesión de clase del salón"
                      value={selectedSession}
                      onChange={(event) =>
                        navigate(
                          event.target.value
                            ? sessionPath(event.target.value)
                            : attendancePath({ vista: "sesiones" }),
                        )
                      }
                    >
                      <option value="">Selecciona una fecha de clase</option>
                      {sessionItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {sessionDate(item.fecha)} ·{" "}
                          {sessionTime(item.hora_inicio, item.hora_fin)} ·{" "}
                          {sessionStates[item.estado]}
                        </option>
                      ))}
                    </SelectField>
                  ) : sessions.loading ? (
                    <Loading>Cargando fechas de clase…</Loading>
                  ) : sessions.error ? (
                    <Feedback onRetry={sessions.reload}>
                      {sessions.error}
                    </Feedback>
                  ) : (
                    <p>El salón todavía no tiene fechas de clase.</p>
                  )}
                  {sessions.data?.puedeProgramar && (
                    <Button onClick={() => openSessionTool("programar")}>
                      <Plus size={15} aria-hidden="true" /> Nueva fecha de clase
                    </Button>
                  )}
                </div>
                <div className="attendance-workspace-actions">
                  <Button
                    aria-pressed={!selectedSession && view !== "matriz"}
                    onClick={() =>
                      navigate(attendancePath({ vista: "sesiones" }))
                    }
                  >
                    <Calendar size={15} aria-hidden="true" /> Calendario de
                    sesiones
                  </Button>
                  <Button
                    aria-pressed={!selectedSession && view === "matriz"}
                    onClick={() =>
                      navigate(attendancePath({ vista: "matriz" }))
                    }
                  >
                    <Users size={15} aria-hidden="true" /> Matriz mensual
                  </Button>
                  <Button onClick={() => openSessionTool("justificaciones")}>
                    <FileText size={15} aria-hidden="true" /> Revisar
                    justificaciones
                  </Button>
                  <Button onClick={() => openSessionTool("cierre")}>
                    <Lock size={15} aria-hidden="true" /> Revisar cierre de
                    asistencia
                  </Button>
                </div>
              </section>
              <Feedback tone="success">{sessionNotice}</Feedback>
              {selectedSession ? (
                <AttendancePage
                  key={`${selectedSession}:${captureRevision}`}
                  groupId={groupId}
                  sessionId={selectedSession}
                  query={
                    new URLSearchParams({
                      ...Object.fromEntries(query),
                      retorno: attendancePath({ vista: "sesiones" }),
                    })
                  }
                  workspacePath={tabPath}
                  onChanged={attendanceChanged}
                />
              ) : view === "matriz" ? (
                <AttendanceOverviewPage
                  key={groupId}
                  groupId={groupId}
                  query={query}
                  workspacePath={(mes) =>
                    attendancePath({ vista: "matriz", mes })
                  }
                  onChanged={attendanceChanged}
                />
              ) : !sessions.loading || view === "sesiones" ? (
                <SessionsPage
                  id={groupId}
                  query={query}
                  workspacePath={tabPath}
                  workspaceSessionPath={sessionPath}
                  onChanged={sessions.reload}
                />
              ) : null}
            </>
          )}
          {active.key === "calificaciones" && (
            <GradesPage
              groupId={groupId}
              query={query}
              workspacePath={tabPath}
              onChanged={act.reload}
            />
          )}
          {active.key === "nomina" && (
            <GroupRoster
              key={query.get("q") ?? ""}
              groupId={groupId}
              query={query}
              canEdit={access.enrollments}
              embedded
            />
          )}
          {panel === "justificaciones" && (
            <JustificationsDrawer groupId={groupId} onClose={closePanel} />
          )}
          {panel === "cierre" && (
            <AttendanceClosureModal groupId={groupId} onClose={closePanel} />
          )}
          {panel === "programar" && sessions.data?.puedeProgramar && (
            <SessionForm
              group={sessions.data.grupo}
              endpoint={sessionsEndpoint}
              onClose={() => setPanel(null)}
              onSaved={(count) => {
                setPanel(null);
                notifySessions(
                  count === 1
                    ? "Se programó 1 sesión."
                    : `Se programaron ${count} sesiones.`,
                );
                sessions.reload();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
