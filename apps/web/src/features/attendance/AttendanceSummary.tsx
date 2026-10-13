import { Facts } from "../../shared/ui/Facts";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import type { AttendanceSummaryData } from "./model";

const calculationLabels: Record<AttendanceSummaryData["estado"], string> = {
  NO_APLICA: "No aplica",
  SIN_SESIONES: "Sin sesiones computables",
  INCOMPLETO: "Cálculo incompleto",
  PROVISIONAL: "Cálculo provisional",
  CALCULADO: "Calculado",
};
const conditionLabels = {
  DENTRO_LIMITE: "Dentro del límite de asistencia",
  RETIRADO_INASISTENCIA: "Retirado por inasistencia",
};
/** Presenta el cálculo recibido de la API; no decide faltas, límites ni condiciones. */
export function AttendanceSummary({
  summary,
  label,
  compact = false,
  stale = false,
}: {
  summary?: AttendanceSummaryData;
  label: string;
  compact?: boolean;
  stale?: boolean;
}) {
  if (stale)
    return (
      <section className="attendance-summary" aria-label={label}>
        <p className="muted">
          Resumen no actualizado. Recarga la asistencia para consultar el
          cálculo vigente.
        </p>
      </section>
    );
  if (!summary)
    return (
      <section className="attendance-summary" aria-label={label}>
        <p className="muted">Resumen pendiente de consulta.</p>
      </section>
    );
  const noApplies = summary.estado === "NO_APLICA";
  const percentage =
    summary.inasistenciaPct === null
      ? "Pendiente"
      : `${summary.inasistenciaPct.replace(".", ",")} %`;
  const condition = summary.condicion
    ? conditionLabels[summary.condicion]
    : noApplies
      ? "No aplica"
      : "Condición pendiente";
  const details = (
    <>
      <Facts
        emptyLabel="Pendiente"
        items={[
          ["Sesiones computables", summary.sesionesComputables],
          ["Presentes (P)", summary.presentes],
          ["Faltas registradas", summary.faltas],
          ["Tardanzas", summary.tardanzas],
          ["Faltas por tardanzas", summary.faltasPorTardanzas],
          ["Tardanzas restantes", summary.tardanzasRestantes],
          ["Marcas pendientes", summary.marcasPendientes],
          ["Justificaciones registradas", summary.justificadas],
          ["Justificaciones pendientes", summary.justificadasPendientes],
          ["Justificaciones recuperadas", summary.justificadasRecuperadas],
          ["Justificadas computables", summary.justificadasComputables],
          ["Faltas confirmadas", summary.faltasConfirmadas],
          ["Faltas computables", summary.faltasComputables],
          ["Inasistencia", percentage],
          [
            "Límite de inasistencia",
            `${summary.reglas.inasistenciaMaxPct.replace(".", ",")} %`,
          ],
          ["Tardanzas por falta", summary.reglas.tardanzasPorFalta],
          ["Versión de reglas", summary.reglas.version],
          ["Cierre confirmado", summary.cierreConfirmado ? "Sí" : "No"],
        ]}
      />
      <p className="help">
        El denominador incluye las sesiones realizadas del grupo hasta la fecha
        actual en Lima. Las programadas y canceladas no computan.
      </p>
      <p className="help">
        Presentes (P) cuenta solo las marcas P. Las tardanzas se muestran por
        separado y cuentan inicialmente como presencia.
      </p>
      <p className="help">Los cambios sin guardar no modifican este resumen.</p>
    </>
  );
  return (
    <section
      className={`attendance-summary${compact ? " compact" : ""}`}
      aria-label={label}
    >
      {!compact && <h3>Resumen de asistencia guardada</h3>}
      <p>
        <StatusBadge inactive={summary.condicion !== "DENTRO_LIMITE"}>
          {condition}
        </StatusBadge>
      </p>
      <p className="muted">{calculationLabels[summary.estado]}</p>
      {noApplies ? (
        <p>
          Una solicitud pendiente o anulada no tiene condición académica de
          asistencia.
        </p>
      ) : (
        <>
          {compact && (
            <>
              <p>Inasistencia: {percentage}</p>
              <p>Faltas computables: {summary.faltasComputables}</p>
              <p>
                Tardanzas: {summary.tardanzas} · Faltas por tardanzas:{" "}
                {summary.faltasPorTardanzas}
              </p>
            </>
          )}
          {summary.estado === "INCOMPLETO" && (
            <p className="help">
              El porcentaje es parcial: hay marcas pendientes. No existe una
              condición definitiva de asistencia.
            </p>
          )}
          {summary.justificadasPendientes > 0 && (
            <p className="help">
              Las justificaciones pendientes se incluyen provisionalmente en las
              faltas computables. La condición queda pendiente hasta
              resolverlas.
            </p>
          )}
          {summary.estado === "SIN_SESIONES" && (
            <p className="help">
              Todavía no hay sesiones computables para este intento.
            </p>
          )}
          {compact ? (
            <details>
              <summary>Ver desglose de asistencia</summary>
              {details}
            </details>
          ) : (
            details
          )}
        </>
      )}
    </section>
  );
}
