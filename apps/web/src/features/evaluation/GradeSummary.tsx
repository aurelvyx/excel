import { Facts } from "../../shared/ui/Facts";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { displayedGrade } from "./grade-capture";
import type { GradeSummaryData } from "./grades-model";

export function GradeSummary({
  summary,
  label,
  stale,
  compact = false,
  staleMessage = "Recarga las calificaciones para consultar el cálculo vigente.",
}: {
  summary: GradeSummaryData;
  label: string;
  stale: boolean;
  compact?: boolean;
  staleMessage?: string;
}) {
  return (
    <section aria-label={label} className="grade-summary">
      {stale ? (
        <p className="notice">{staleMessage}</p>
      ) : (
        <>
          <StatusBadge inactive={summary.notaOficial === null}>
            {summary.notaOficial === null
              ? "Calificación pendiente"
              : "Notas guardadas del intento"}
          </StatusBadge>
          {compact ? (
            <>
              <p>Promedio: {displayedGrade(summary.promedio)}</p>
              <p>Nota oficial: {summary.notaOficial ?? "Pendiente"}</p>
              <p>
                Notas: {summary.calificacionesRegistradas} de{" "}
                {summary.calificacionesEsperadas} · Pendientes:{" "}
                {summary.calificacionesPendientes}
              </p>
            </>
          ) : (
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
          )}
          {summary.motivoPendiente && (
            <p className="help">{summary.motivoPendiente}</p>
          )}
        </>
      )}
    </section>
  );
}
