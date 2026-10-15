import { Facts } from "../../shared/ui/Facts";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { displayedGrade } from "./grade-capture";
import type { GradeSummaryData } from "./grades-model";

export function GradeSummary({
  summary,
  label,
  stale,
}: {
  summary: GradeSummaryData;
  label: string;
  stale: boolean;
}) {
  return (
    <section aria-label={label} className="grade-summary">
      {stale ? (
        <p className="notice">
          Recarga las calificaciones para consultar el cálculo vigente.
        </p>
      ) : (
        <>
          <StatusBadge inactive={summary.notaOficial === null}>
            {summary.notaOficial === null
              ? "Calificación pendiente"
              : "Notas guardadas del intento"}
          </StatusBadge>
          <Facts
            items={[
              ["Promedio", displayedGrade(summary.promedio)],
              ["Nota oficial calculada", summary.notaOficial ?? "Pendiente"],
              [
                "Notas registradas",
                `${summary.calificacionesRegistradas} de ${summary.calificacionesEsperadas}`,
              ],
              ["Notas pendientes", summary.calificacionesPendientes],
            ]}
          />
          {summary.motivoPendiente && (
            <p className="help">{summary.motivoPendiente}</p>
          )}
        </>
      )}
    </section>
  );
}
