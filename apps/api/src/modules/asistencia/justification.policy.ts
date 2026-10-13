export const justificationStates = [
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'RECUPERADA',
  'NO_RECUPERADA',
] as const;
export type JustificationState = (typeof justificationStates)[number];

export class JustificationConflict extends Error {}

/** RF34–35/RN15–20: no sustituye decisiones anteriores ni salta su aprobación. */
export function justificationTransition(
  previousState: JustificationState,
  nextState: JustificationState,
  expectedVersion: number,
  currentVersion: number,
): JustificationState {
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0 ||
    !Number.isSafeInteger(currentVersion) ||
    currentVersion <= 0 ||
    expectedVersion !== currentVersion
  )
    throw new JustificationConflict(
      'La justificación cambió desde tu última consulta. Recarga antes de continuar',
    );
  const allowed =
    (previousState === 'PENDIENTE' &&
      (nextState === 'APROBADA' || nextState === 'RECHAZADA')) ||
    (previousState === 'APROBADA' &&
      (nextState === 'RECUPERADA' || nextState === 'NO_RECUPERADA'));
  if (!allowed)
    throw new JustificationConflict(
      'La transición no está disponible para el estado actual de la justificación',
    );
  return nextState;
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Día civil de recepción; no impone un plazo institucional adicional. */
export function validateJustificationPresentation(
  fecha: string,
  sessionDate: string,
  today: string,
): void {
  if (!validDate(fecha) || !validDate(sessionDate) || !validDate(today))
    throw new Error(
      'La fecha de presentación debe ser una fecha válida YYYY-MM-DD',
    );
  if (fecha < sessionDate || fecha > today)
    throw new Error(
      'La fecha de presentación debe estar entre la fecha de clase y hoy',
    );
}

/** El cierre administrativo y sus correcciones posteriores corresponden a B15. */
export function justificationReadOnlyReason(value: {
  groupState: string;
  periodState: string;
  enrollmentState: string;
  sessionState: string;
  sessionDate: string;
  today: string;
}): string | null {
  if (value.groupState !== 'ACTIVO' || value.periodState !== 'ABIERTO')
    return 'El grupo y el periodo deben estar abiertos para gestionar justificaciones';
  if (value.enrollmentState !== 'ACTIVA')
    return 'Solo se pueden gestionar justificaciones de matrículas activas';
  if (value.sessionState !== 'REALIZADA')
    return 'La sesión debe estar realizada para gestionar justificaciones';
  if (!validDate(value.sessionDate) || !validDate(value.today))
    return 'La fecha de clase no es válida para gestionar justificaciones';
  if (value.sessionDate > value.today)
    return 'La fecha de esta sesión aún no ha llegado';
  return null;
}
