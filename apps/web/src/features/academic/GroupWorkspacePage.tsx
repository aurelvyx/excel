import { useState } from "react";
import {
  Calendar,
  FileCheck,
  FileText,
  GraduationCap,
  Lock,
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
import { sessionDate, sessionStates } from "../attendance/model";
import { SelectField } from "../../shared/ui/Field";
import { navigate } from "../../shared/navigation";
import { GroupRoster } from "../enrollments/GroupRoster";
import { GradesPage } from "../evaluation/GradesPage";
import type { ActView } from "../evaluation/acts-model";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Button } from "../../shared/ui/Button";
import { AttendanceOverviewPage } from "../attendance/AttendanceOverviewPage";
import { AttendanceClosureModal } from "./components/AttendanceClosureModal";
import { JustificationsDrawer } from "./components/JustificationsDrawer";
import { WorkspaceSummary } from "./components/WorkspaceSummary";
import "./academic.css";

const tabs = [
  { key: "asistencia", label: "Control de asistencia", Icon: Calendar },
  { key: "calificaciones", label: "Calificaciones", Icon: GraduationCap },
  { key: "nomina", label: "Alumnos matriculados", Icon: Users },
] as const;

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
  const sessions = useApiQuery(
    `asistencia/grupos/${groupId}/sesiones`,
    loadAllSessions,
  );
  const act = useApiQuery<ActView>(`evaluacion/grupos/${groupId}/acta?limit=1`);
  const [view, setView] = useState<"sesiones" | "matriz">("sesiones");
  const [panel, setPanel] = useState<"justificaciones" | "cierre" | null>(null);
  const path = `/salones/${groupId}`;
  const available = tabs.filter((tab) => tab.key !== "nomina" || access.reader);
  const active =
    available.find((tab) => tab.key === query.get("tab")) ?? tabs[0];
  const selectedSession = query.get("sesion") ?? "";
  const tabPath = (after: string) => {
    const params = new URLSearchParams({ tab: active.key });
    if (selectedSession && active.key === "asistencia")
      params.set("sesion", selectedSession);
    if (after) params.set("after", after);
    return `${path}?${params}`;
  };
  const sessionPath = (id: string) =>
    `${path}?${new URLSearchParams({ tab: "asistencia", sesion: id })}`;
  function attendanceChanged() {
    act.reload();
    sessions.reload();
  }
  function closePanel() {
    setPanel(null);
    act.reload();
  }

  return (
    <section className="academic-container">
      <a
        className="back-link"
        href={access.teacherOnly ? "#/docencia/clases" : "#/gestion-academica"}
      >
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
              {sessions.data?.items.length ? (
                <SelectField
                  label="Sesión de clase del salón"
                  value={selectedSession}
                  onChange={(event) =>
                    navigate(
                      event.target.value
                        ? sessionPath(event.target.value)
                        : `${path}?tab=asistencia`,
                    )
                  }
                >
                  <option value="">Ver calendario y programación</option>
                  {sessions.data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {sessionDate(item.fecha)} · {sessionStates[item.estado]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <div
                className="workspace-tools"
                aria-label="Herramientas de asistencia del salón"
              >
                <Button
                  onClick={() => {
                    setView("sesiones");
                    if (selectedSession) navigate(`${path}?tab=asistencia`);
                  }}
                  aria-pressed={!selectedSession && view === "sesiones"}
                >
                  <Calendar size={15} aria-hidden="true" /> Calendario de
                  sesiones
                </Button>
                <Button
                  onClick={() => {
                    setView("matriz");
                    if (selectedSession) navigate(`${path}?tab=asistencia`);
                  }}
                  aria-pressed={!selectedSession && view === "matriz"}
                >
                  <Users size={15} aria-hidden="true" /> Matriz mensual
                </Button>
                <Button onClick={() => setPanel("justificaciones")}>
                  <FileText size={15} aria-hidden="true" /> Revisar
                  justificaciones
                </Button>
                <Button onClick={() => setPanel("cierre")}>
                  <Lock size={15} aria-hidden="true" /> Revisar cierre de
                  asistencia
                </Button>
              </div>
              {selectedSession ? (
                <AttendancePage
                  groupId={groupId}
                  sessionId={selectedSession}
                  query={
                    new URLSearchParams({
                      ...Object.fromEntries(query),
                      retorno: `${path}?tab=asistencia`,
                    })
                  }
                  workspacePath={tabPath}
                  onChanged={attendanceChanged}
                />
              ) : view === "sesiones" ? (
                <SessionsPage
                  id={groupId}
                  query={query}
                  workspacePath={tabPath}
                  workspaceSessionPath={sessionPath}
                />
              ) : (
                <AttendanceOverviewPage
                  groupId={groupId}
                  query={
                    new URLSearchParams({ retorno: `${path}?tab=asistencia` })
                  }
                  onChanged={attendanceChanged}
                />
              )}
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
        </>
      )}
    </section>
  );
}
