export type AttendanceCode = 'P' | 'F' | 'T' | 'J';
export type AttendanceValue = {
  codigo: AttendanceCode;
  observacion: string | null;
  version: number;
};
export type AttendanceInput = {
  codigo: AttendanceCode;
  observacion?: string | null;
  version: number | null;
};

/** El registro confirma una clase ocurrida; el cálculo oficial se implementa en B13. */
export function attendanceReadOnlyReason(value: {
  canWrite: boolean;
  groupState: string;
  periodState: string;
  sessionState: string;
  sessionDate: string;
  today: string;
}): string | null {
  if (!value.canWrite)
    return 'Tu cuenta solo tiene permiso de consulta para este grupo';
  if (value.groupState !== 'ACTIVO' || value.periodState !== 'ABIERTO')
    return 'El grupo y el periodo deben estar abiertos para registrar asistencia';
  if (value.sessionState === 'CANCELADA') return 'La sesión está cancelada';
  if (value.sessionDate > value.today)
    return 'La fecha de esta sesión aún no ha llegado';
  return null;
}
export class AttendanceConflict extends Error {}

/** No sobrescribe una lectura anterior, ni convierte un pendiente en falta. */
export function attendanceChange(
  before: AttendanceValue | null,
  input: AttendanceInput,
) {
  if ((before?.version ?? null) !== input.version)
    throw new AttendanceConflict(
      'La asistencia cambió desde tu última consulta. Recarga antes de guardar',
    );
  const observation =
    input.observacion === undefined
      ? (before?.observacion ?? null)
      : input.observacion?.trim() || null;
  return {
    codigo: input.codigo,
    observacion: observation,
    changed:
      before === null ||
      before.codigo !== input.codigo ||
      before.observacion !== observation,
  };
}
