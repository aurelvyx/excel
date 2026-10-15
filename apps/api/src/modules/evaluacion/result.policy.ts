import type { AttendanceSummary } from '../asistencia/attendance-calculation.policy.js';
import type { GradeSummary } from './grade-calculation.service.js';

export type AcademicCondition =
  'APROBADO' | 'DESAPROBADO' | 'RETIRADO_INASISTENCIA';
export type ResultDecision = {
  condicion: AcademicCondition | null;
  listo: boolean;
  pendientes: string[];
};
export type ResultInput = {
  resumenAsistencia: Pick<
    AttendanceSummary,
    | 'estado'
    | 'sesionesComputables'
    | 'marcasPendientes'
    | 'excedeLimite'
    | 'cierreConfirmado'
  > | null;
  resumenNotas: Pick<
    GradeSummary,
    | 'configuracionAprobada'
    | 'calificacionesEsperadas'
    | 'calificacionesPendientes'
    | 'promedio'
    | 'notaOficial'
  > | null;
  notaMinima: string | null;
};

/** La regla pertenece al intento; no se sustituye por un parámetro futuro. */
function minimumHundredths(value: string | null): bigint | null {
  if (value === null || !/^\d{1,2}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return result <= 2000n ? result : null;
}

/**
 * B18/RF43: asistencia antes que nota, con los cálculos exactos de B13/B17.
 * La consulta puede preparar una condición calculada antes del cierre; el cierre
 * de acta exige adicionalmente asistencia cerrada y confirmación administrativa.
 * Ninguna condición sustituye datos pendientes por ceros o faltas.
 */
export function determineAcademicResult(input: ResultInput): ResultDecision {
  const pendientes: string[] = [];
  const attendance = input.resumenAsistencia;
  const grades = input.resumenNotas;
  const minimum = minimumHundredths(input.notaMinima);
  if (!attendance || attendance.sesionesComputables === 0)
    pendientes.push('No hay sesiones computables para determinar el resultado');
  if (attendance && attendance.marcasPendientes > 0)
    pendientes.push('Hay marcas de asistencia pendientes');
  if (
    attendance &&
    attendance.sesionesComputables > 0 &&
    attendance.marcasPendientes === 0 &&
    (attendance.estado !== 'CALCULADO' || attendance.excedeLimite === null)
  )
    pendientes.push('La asistencia no tiene un cálculo definitivo');
  if (!grades?.configuracionAprobada)
    pendientes.push('No hay criterios aprobados aplicados al grupo');
  if (
    !grades ||
    grades.calificacionesEsperadas === 0 ||
    grades.calificacionesPendientes > 0 ||
    grades.promedio === null ||
    grades.notaOficial === null
  )
    pendientes.push('Las calificaciones del intento deben estar completas');
  if (minimum === null)
    pendientes.push('Falta una nota mínima válida de las reglas del intento');
  if (pendientes.length) return { condicion: null, listo: false, pendientes };
  // El porcentaje mostrado ya fue redondeado: solo se usa la decisión exacta.
  const condicion: AcademicCondition = attendance!.excedeLimite
    ? 'RETIRADO_INASISTENCIA'
    : BigInt(grades!.notaOficial!) * 100n < minimum!
      ? 'DESAPROBADO'
      : 'APROBADO';
  return { condicion, listo: true, pendientes: [] };
}
