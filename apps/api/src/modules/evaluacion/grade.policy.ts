import {
  EvaluationDefinitionError,
  evaluationWeightBasisPoints,
  normalizeEvaluationDefinition,
  validateEvaluationDefinition,
  type EvaluationDefinition,
} from './evaluation.policy.js';

export type GradeValue = {
  evaluacionOrden: number;
  indicadorOrden: number;
  nota: string | null;
};
export type GradeAverage = {
  promedio: string | null;
  notaOficial: number | null;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
};

export class GradePolicyError extends Error {}

/** RN21: centésimas de nota, con entrada decimal textual sin conversión a float. */
function gradeHundredths(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,2}(\.\d{1,2})?$/.test(value))
    throw new GradePolicyError(
      'La nota debe ser texto decimal con punto y hasta dos decimales',
    );
  const [whole, fraction = ''] = value.split('.');
  const grade = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (grade > 2000n)
    throw new GradePolicyError('La nota debe estar entre 0 y 20');
  return grade;
}

export function normalizeGrade(value: unknown): string {
  const grade = gradeHundredths(value);
  return `${grade / 100n}.${(grade % 100n).toString().padStart(2, '0')}`;
}

const denominator = 10000000000n;

/** Decimal exacto: dos a diez decimales, sin redondeo intermedio. */
function exactAverage(numerator: bigint): string {
  const decimals = (numerator % denominator)
    .toString()
    .padStart(10, '0')
    .replace(/0+$/, '')
    .padEnd(2, '0');
  return `${numerator / denominator}.${decimals}`;
}

function criterionKey(evaluationOrder: number, indicatorOrder: number): string {
  if (
    !Number.isInteger(evaluationOrder) ||
    !Number.isInteger(indicatorOrder) ||
    evaluationOrder < 1 ||
    indicatorOrder < 1
  )
    throw new GradePolicyError('La nota debe identificar un criterio válido');
  return `${evaluationOrder}:${indicatorOrder}`;
}

/**
 * B17/RF41–42: calcula exclusivamente con la estructura aprobada por el llamador.
 * La fracción exacta pondera indicadores y evaluaciones antes de redondear.
 * No decide asistencia, condición final ni cierre del acta (B18).
 */
export function calculateGradeAverage(
  formula: string,
  structure: EvaluationDefinition,
  grades: readonly GradeValue[],
): GradeAverage {
  if (formula !== 'PONDERADA_JERARQUICA_V1')
    throw new GradePolicyError('La fórmula de evaluación no está soportada');
  let definition: EvaluationDefinition;
  try {
    definition = normalizeEvaluationDefinition(structure);
    if (!validateEvaluationDefinition(definition).completa)
      throw new GradePolicyError(
        'El promedio requiere criterios completos con pesos de 100.00 %',
      );
  } catch (error) {
    if (error instanceof EvaluationDefinitionError)
      throw new GradePolicyError(error.message);
    throw error;
  }
  if (!Array.isArray(grades))
    throw new GradePolicyError('Las notas deben ser una lista de criterios');

  const weights = new Map<string, bigint>();
  for (const evaluation of definition.evaluaciones)
    for (const indicator of evaluation.indicadores)
      weights.set(
        criterionKey(evaluation.orden, indicator.orden),
        evaluationWeightBasisPoints(evaluation.pesoPct) *
          evaluationWeightBasisPoints(indicator.pesoPct),
      );

  const seen = new Set<string>();
  let numerator = 0n;
  let registered = 0;
  for (const grade of grades) {
    if (typeof grade !== 'object' || grade === null)
      throw new GradePolicyError('La nota debe identificar un criterio válido');
    const key = criterionKey(grade.evaluacionOrden, grade.indicadorOrden);
    const weight = weights.get(key);
    if (weight === undefined)
      throw new GradePolicyError('La nota pertenece a un criterio ajeno');
    if (seen.has(key))
      throw new GradePolicyError('No se admite más de una nota por criterio');
    seen.add(key);
    if (grade.nota === null) continue;
    numerator += gradeHundredths(grade.nota) * weight;
    registered++;
  }
  const pending = weights.size - registered;
  return {
    promedio: pending === 0 ? exactAverage(numerator) : null,
    notaOficial:
      pending === 0
        ? Number((numerator + denominator / 2n) / denominator)
        : null,
    calificacionesEsperadas: weights.size,
    calificacionesRegistradas: registered,
    calificacionesPendientes: pending,
  };
}
