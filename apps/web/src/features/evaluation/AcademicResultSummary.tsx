import { academicConditionLabels } from "../../shared/academic-result";
import { StatusBadge } from "../../shared/ui/StatusBadge";

/** Presenta la decisión recibida; la prioridad de asistencia se resuelve en la API. */
export function AcademicResultSummary({
  condition,
  pending = [],
  confirmed = false,
  stale = false,
  label,
}: {
  condition: string | null;
  pending?: readonly string[];
  confirmed?: boolean;
  stale?: boolean;
  label: string;
}) {
  return (
    <section className="grade-summary" aria-label={label}>
      {stale ? (
        <p className="notice">
          Resultado no actualizado. Recarga el acta para consultar los datos
          vigentes.
        </p>
      ) : (
        <>
          <StatusBadge inactive={condition !== "APROBADO"}>
            {condition
              ? (academicConditionLabels[condition] ?? condition)
              : "Resultado pendiente"}
          </StatusBadge>
          <p className="help">
            {confirmed
              ? "Resultado confirmado en acta"
              : "Cálculo para revisión; aún sin confirmar en acta"}
          </p>
          {pending.length > 0 && (
            <ul>
              {pending.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
