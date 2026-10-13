import { Facts } from "../../shared/ui/Facts";
import type { ClosureWarnings as Warnings } from "./closure-model";

export function ClosureWarnings({
  warnings,
  stale = false,
}: {
  warnings: Warnings;
  stale?: boolean;
}) {
  return (
    <section className="closure-warnings" aria-label="Revisión de asistencia">
      <h2>Revisión de asistencia</h2>
      {stale ? (
        <p className="notice">
          Revisión no actualizada. Recarga el cierre para consultar los datos
          vigentes.
        </p>
      ) : (
        <>
          <Facts
            items={[
              ["Sesiones computables", warnings.sesionesComputables],
              ["Sesiones programadas", warnings.sesionesProgramadas],
              ["Sesiones futuras", warnings.sesionesFuturas],
              ["Sesiones canceladas", warnings.sesionesCanceladas],
              ["Matrículas revisables", warnings.matriculasRevisables],
              ["Marcas pendientes", warnings.marcasPendientes],
              [
                "Justificaciones pendientes",
                warnings.justificacionesPendientes,
              ],
            ]}
          />
          {warnings.sesionesComputables === 0 && (
            <p className="notice">
              No hay sesiones computables. El cierre no determinará una
              condición de asistencia sin sesiones.
            </p>
          )}
          {warnings.matriculasRevisables === 0 && (
            <p className="notice">
              No hay matrículas revisables en este grupo.
            </p>
          )}
          {warnings.marcasPendientes > 0 && (
            <p className="notice">
              Hay marcas sin registrar. El cierre las conserva pendientes y el
              cálculo seguirá incompleto.
            </p>
          )}
          {warnings.justificacionesPendientes > 0 && (
            <p className="notice">
              Las J sin recuperación confirmada computarán como falta al cierre.
              Las solicitudes conservarán su estado.
            </p>
          )}
          {(warnings.sesionesProgramadas > 0 ||
            warnings.sesionesFuturas > 0) && (
            <p className="notice">
              Las sesiones programadas o futuras no se incluirán en el cálculo
              al cierre.
            </p>
          )}
          <p className="help">
            Las sesiones canceladas no computan. Cerrar asistencia no registra
            faltas automáticamente ni resuelve justificaciones.
          </p>
        </>
      )}
    </section>
  );
}
