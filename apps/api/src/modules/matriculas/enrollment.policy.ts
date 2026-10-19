export interface Availability {
  activo: boolean;
  estado_grupo: string;
  estado_periodo: string;
  fecha: string;
  matricula_inicio: string;
  matricula_fin: string;
  capacidad: number | null;
  ocupados: number;
}
/** Fechas ISO locales de la sede, con extremos inclusivos. Sin reglas oficiales en React. */
export function enrollmentAvailability(value: Availability): void {
  if (!value.activo) throw new Error('La oferta académica está inactiva');
  if (value.estado_grupo !== 'ACTIVO' || value.estado_periodo !== 'ABIERTO')
    throw new Error('El grupo o periodo no admite matrículas');
  if (value.fecha < value.matricula_inicio || value.fecha > value.matricula_fin)
    throw new Error('Fuera del plazo de matrícula');
  if (value.capacidad !== null && value.ocupados >= value.capacidad)
    throw new Error('El grupo no tiene vacantes');
}
export function nextAttempt(previous: number): number {
  if (!Number.isInteger(previous) || previous < 0 || previous >= 32767)
    throw new Error('No se puede asignar otro número de intento');
  return previous + 1;
}
/** Correlativo global de matrícula; no se confunde con el intento por nivel. */
export function enrollmentCode(document: string, sequence: string): string {
  return `MAT-${document}-${sequence}`;
}
