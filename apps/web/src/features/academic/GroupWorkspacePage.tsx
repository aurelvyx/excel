import { Calendar, FileCheck, GraduationCap, Users } from "lucide-react";
import type { Access } from "../../app/access";
import { text, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Facts } from "../../shared/ui/Facts";
import { PageHeading } from "../../shared/ui/PageHeading";
import { SessionsPage } from "../attendance/SessionsPage";
import { GroupRoster } from "../enrollments/GroupRoster";
import { GradesPage } from "../evaluation/GradesPage";
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
  const path = `/salones/${groupId}`;
  const available = tabs.filter((tab) => tab.key !== "nomina" || access.reader);
  const active = available.find((tab) => tab.key === query.get("tab")) ?? tabs[0];
  const tabPath = (after: string) => {
    const params = new URLSearchParams({ tab: active.key });
    if (after) params.set("after", after);
    return `${path}?${params}`;
  };

  return (
    <section className="academic-container">
      <a className="back-link" href={access.teacherOnly ? "#/docencia/clases" : "#/gestion-academica"}>
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
        <Feedback onRetry={group.reload}>{group.error || "No se encontró el grupo."}</Feedback>
      ) : (
        <>
          <div className="academic-card" aria-label="Información del salón">
            <Facts items={[
              ["Grupo", text(group.data, "codigo")],
              ["Idioma", text(group.data, "contexto.idioma")],
              ["Nivel", text(group.data, "contexto.nivel")],
              ["Periodo", text(group.data, "contexto.periodo")],
              ["Turno", text(group.data, "contexto.turno")],
              ["Sección", text(group.data, "contexto.seccion")],
            ]} />
            <a href={`#/evaluacion/grupos/${groupId}/acta`} className="academic-btn-action btn-action-secondary">
              <FileCheck size={14} aria-hidden="true" /> Resultados y acta del salón
            </a>
          </div>
          <nav aria-label="Secciones del salón" className="academic-tabs">
            {available.map(({ key, label, Icon }) => (
              <a key={key} className={`academic-tab-btn ${active.key === key ? "active" : ""}`}
                aria-current={active.key === key ? "page" : undefined} href={`#${path}?tab=${key}`}>
                <Icon size={16} aria-hidden="true" /> {label}
              </a>
            ))}
          </nav>
          {active.key === "asistencia" && <SessionsPage id={groupId} query={query} workspacePath={tabPath} />}
          {active.key === "calificaciones" && <GradesPage groupId={groupId} query={query} workspacePath={tabPath} />}
          {active.key === "nomina" && <GroupRoster key={query.get("q") ?? ""} groupId={groupId} query={query} canEdit={access.enrollments} embedded />}
        </>
      )}
    </section>
  );
}
