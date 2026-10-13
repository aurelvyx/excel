export type AttendanceTotals = {
  sesionesComputables: number;
  presentes: number;
  faltas: number;
  tardanzas: number;
  marcasPendientes: number;
  justificadasPendientes: number;
  justificadasRecuperadas: number;
  justificadasRechazadas: number;
  justificadasNoRecuperadas: number;
};
export type AttendanceRules = {
  parametroId: string;
  version: number;
  inasistenciaMaxPct: string;
  tardanzasPorFalta: number;
};
export type AttendanceCalculationState =
  'NO_APLICA' | 'SIN_SESIONES' | 'INCOMPLETO' | 'PROVISIONAL' | 'CALCULADO';

/** Un resumen del intento no confirma notas, actas ni resultados académicos finales. */
export type AttendanceSummary = {
  estado: AttendanceCalculationState;
  sesionesComputables: number;
  presentes: number;
  faltas: number;
  tardanzas: number;
  justificadas: number;
  marcasPendientes: number;
  faltasPorTardanzas: number;
  tardanzasRestantes: number;
  justificadasPendientes: number;
  justificadasRecuperadas: number;
  justificadasComputables: number;
  faltasConfirmadas: number;
  faltasComputables: number;
  inasistenciaPct: string | null;
  excedeLimite: boolean | null;
  condicion: 'DENTRO_LIMITE' | 'RETIRADO_INASISTENCIA' | null;
  reglas: AttendanceRules;
  cierreConfirmado: boolean;
  criterioSesiones: 'REALIZADAS_DEL_GRUPO_HASTA_HOY';
};

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('El conteo de asistencia debe ser un entero no negativo');
  return value;
}
function hundredths(value: string): bigint {
  if (!/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/.test(value))
    throw new Error('El máximo de inasistencia debe tener hasta dos decimales');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > 10000n) throw new Error('El máximo debe estar entre 0 y 100');
  return result;
}
function decimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** RF31–32/RN12–14: comparación exacta; el redondeo solo pertenece a la presentación. */
export function calculateAttendance(
  totals: AttendanceTotals,
  rules: AttendanceRules,
  enrollmentState: string,
  closed = false,
): AttendanceSummary {
  for (const value of Object.values(totals)) count(value);
  if (count(rules.version) === 0 || count(rules.tardanzasPorFalta) === 0)
    throw new Error('La versión y equivalencia académicas deben ser positivas');
  const maximum = hundredths(rules.inasistenciaMaxPct);
  const justified =
    totals.justificadasPendientes +
    totals.justificadasRecuperadas +
    totals.justificadasRechazadas +
    totals.justificadasNoRecuperadas;
  if (
    totals.presentes +
      totals.faltas +
      totals.tardanzas +
      totals.marcasPendientes +
      justified !==
    totals.sesionesComputables
  )
    throw new Error(
      'Cada sesión computable debe tener una marca o quedar pendiente',
    );
  const late = BigInt(totals.tardanzas);
  const ratio = BigInt(rules.tardanzasPorFalta);
  const equivalent = Number(late / ratio);
  const resolvedJustified =
    totals.justificadasRechazadas + totals.justificadasNoRecuperadas;
  const confirmed =
    totals.faltas +
    equivalent +
    resolvedJustified +
    (closed ? totals.justificadasPendientes : 0);
  const absences = confirmed + (closed ? 0 : totals.justificadasPendientes);
  let state: AttendanceCalculationState = 'CALCULADO';
  if (!['ACTIVA', 'CERRADA'].includes(enrollmentState)) state = 'NO_APLICA';
  else if (totals.sesionesComputables === 0) state = 'SIN_SESIONES';
  else if (totals.marcasPendientes > 0) state = 'INCOMPLETO';
  else if (!closed && totals.justificadasPendientes > 0) state = 'PROVISIONAL';
  const applicable = state !== 'NO_APLICA' && state !== 'SIN_SESIONES';
  const numerator = BigInt(absences);
  const denominator = BigInt(totals.sesionesComputables);
  const above = applicable ? numerator * 10000n > denominator * maximum : null;
  const percentage = applicable
    ? decimal((numerator * 10000n + denominator / 2n) / denominator)
    : null;
  return {
    estado: state,
    sesionesComputables: totals.sesionesComputables,
    presentes: totals.presentes,
    faltas: totals.faltas,
    tardanzas: totals.tardanzas,
    justificadas: justified,
    marcasPendientes: totals.marcasPendientes,
    faltasPorTardanzas: equivalent,
    tardanzasRestantes: Number(late % ratio),
    justificadasPendientes: totals.justificadasPendientes,
    justificadasRecuperadas: totals.justificadasRecuperadas,
    justificadasComputables: resolvedJustified + totals.justificadasPendientes,
    faltasConfirmadas: confirmed,
    faltasComputables: absences,
    inasistenciaPct: percentage,
    excedeLimite: above,
    condicion:
      state === 'CALCULADO'
        ? above
          ? 'RETIRADO_INASISTENCIA'
          : 'DENTRO_LIMITE'
        : null,
    reglas: { ...rules, inasistenciaMaxPct: decimal(maximum) },
    cierreConfirmado: closed,
    criterioSesiones: 'REALIZADAS_DEL_GRUPO_HASTA_HOY',
  };
}
