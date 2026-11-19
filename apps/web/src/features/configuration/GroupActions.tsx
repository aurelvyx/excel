import { ReportLink } from "../reports/ReportLink";
import { withAttendanceReturn } from "../attendance/navigation";
import { useAuth } from "../auth/session";

export function GroupActions({
  id,
  returnTo,
}: {
  id: string | number;
  returnTo: string;
}) {
  const { session } = useAuth();
  const canReadRoster = session.user.roles.some((role) => role !== "DOCENTE");
  return (
    <div className="group-actions">
      <a className="button group-primary-action" href={`#/salones/${id}`}>
        Salón 360°
      </a>
      <a
        className="button group-primary-action"
        href={`#/evaluacion/grupos/${id}/calificaciones`}
      >
        Calificaciones
      </a>
      <a
        className="button group-primary-action group-attendance-action"
        href={`#${withAttendanceReturn(`/asistencia/grupos/${id}`, returnTo)}`}
      >
        Sesiones
      </a>
      <a className="button" href={`#/evaluacion/grupos/${id}/acta`}>
        Resultados y acta
      </a>
      <details className="group-more-actions">
        <summary>Más</summary>
        <div className="group-more-menu">
          {canReadRoster && <a href={`#/matriculas/grupo/${id}`}>Nómina</a>}
          <a
            href={`#${withAttendanceReturn(`/asistencia/grupos/${id}/matriz`, returnTo)}`}
          >
            Matriz de asistencia
          </a>
          <a href={`#/asistencia/grupos/${id}/justificaciones`}>
            Justificaciones
          </a>
          <a href={`#/asistencia/grupos/${id}/cierre`}>Cierre de asistencia</a>
          <a href={`#/evaluacion/grupos/${id}`}>Evaluaciones</a>
          <ReportLink groupId={id} />
        </div>
      </details>
    </div>
  );
}
