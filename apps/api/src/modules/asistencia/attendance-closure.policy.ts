export class AttendanceClosureConflict extends Error {}

export type AttendanceClosureCounts = {
  sesionesComputables: number;
  sesionesProgramadas: number;
  sesionesFuturas: number;
  matriculasRevisables: number;
  marcasPendientes: number;
  justificacionesPendientes: number;
};

/** RF36/CU13: la confirmación corresponde a los mismos datos que se revisaron. */
export function validateAttendanceClosureRevision(
  expected: string,
  current: string,
): void {
  if (
    !/^[0-9a-f]{64}$/.test(expected) ||
    !/^[0-9a-f]{64}$/.test(current) ||
    expected !== current
  )
    throw new AttendanceClosureConflict(
      'La asistencia cambió desde la revisión del cierre. Recarga antes de confirmar',
    );
}

/** Advierte datos pendientes sin inventar marcas, plazos ni resolución de solicitudes. */
export function attendanceClosureWarnings(
  counts: AttendanceClosureCounts,
): string[] {
  for (const value of Object.values(counts))
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Los conteos del cierre deben ser enteros no negativos');
  const warnings: string[] = [];
  if (counts.sesionesComputables === 0)
    warnings.push(
      'No hay sesiones computables; no se determina una condición de asistencia',
    );
  if (counts.matriculasRevisables === 0)
    warnings.push('No hay matrículas activas o cerradas para revisar');
  if (counts.sesionesProgramadas > 0)
    warnings.push(
      'Hay sesiones programadas; no computan y quedarán bloqueadas al cerrar',
    );
  if (counts.sesionesFuturas > 0)
    warnings.push(
      'Hay sesiones futuras; no entran en el cálculo con la fecha de corte del cierre',
    );
  if (counts.marcasPendientes > 0)
    warnings.push(
      'Hay marcas pendientes; no se sustituyen por faltas y el cálculo seguirá incompleto',
    );
  if (counts.justificacionesPendientes > 0)
    warnings.push(
      'Hay marcas J sin recuperación confirmada; computarán como faltas al cierre y se conservará su historial',
    );
  return warnings;
}

export function requireAttendanceClosureConfirmation(
  warnings: readonly string[],
  confirmarPendientes: boolean,
): void {
  if (warnings.length > 0 && confirmarPendientes !== true)
    throw new AttendanceClosureConflict(
      'Confirma que revisaste los pendientes y las advertencias antes de cerrar',
    );
}

/** El registro ordinario sigue cerrado incluso cuando un administrador corrige una marca. */
export function attendanceClosureReadOnlyReason(
  closureId: string | null,
): string | null {
  return closureId === null
    ? null
    : 'La asistencia está cerrada; solo el administrador puede corregir con motivo y auditoría';
}
