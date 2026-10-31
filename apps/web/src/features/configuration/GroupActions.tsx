import { ReportLink } from "../reports/ReportLink";
import { withAttendanceReturn } from "../attendance/navigation";

export function GroupActions({
  id,
  returnTo,
}: {
  id: string | number;
  returnTo: string;
}) {
  return (
    <div className="group-actions">
      <a
        className="button group-primary-action"
        href={`#/evaluacion/grupos/${id}/calificaciones`}
      >
        Notas
      </a>
      <a
        className="button group-primary-action group-attendance-action"
        href={`#${withAttendanceReturn(`/asistencia/grupos/${id}/matriz`, returnTo)}`}
      >
        Asistencias
      </a>
      <details className="group-more-actions">
        <summary>Más</summary>
        <div className="group-more-menu">
          <a href={`#/matriculas/grupo/${id}`}>Nómina</a>
          <a href={`#${withAttendanceReturn(`/asistencia/grupos/${id}`, returnTo)}`}>Sesiones</a>
          <a href={`#/asistencia/grupos/${id}/justificaciones`}>Justificaciones</a>
          <a href={`#/asistencia/grupos/${id}/cierre`}>Cierre de asistencia</a>
          <a href={`#/evaluacion/grupos/${id}`}>Evaluaciones</a>
          <a href={`#/evaluacion/grupos/${id}/acta`}>Resultados y acta</a>
          <ReportLink groupId={id} />
        </div>
      </details>
    </div>
  );
}
