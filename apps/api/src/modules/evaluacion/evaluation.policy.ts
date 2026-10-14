export type EvaluationIndicator = {
  codigo: string;
  descripcion: string;
  pesoPct: string;
  orden: number;
};
export type EvaluationComponent = {
  nombre: string;
  unidadId: string | null;
  pesoPct: string;
  orden: number;
  indicadores: EvaluationIndicator[];
};
export type EvaluationDefinition = { evaluaciones: EvaluationComponent[] };
export type EvaluationValidation = {
  completa: boolean;
  pesoTotalPct: string;
  evaluaciones: number;
  indicadores: number;
  errores: string[];
};
export type GradeReadiness = {
  criteriosAprobados: boolean;
  matriculasRevisables: number;
  indicadores: number;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
  puedeCerrar: boolean;
  motivos: string[];
};

export class EvaluationDefinitionError extends Error {}

function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new EvaluationDefinitionError(
      'La estructura de evaluación no es válida',
    );
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new EvaluationDefinitionError(
      'La estructura contiene campos no permitidos',
    );
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum
  )
    throw new EvaluationDefinitionError(
      `${label} es obligatorio y admite hasta ${maximum} caracteres`,
    );
  return value.trim();
}
function order(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 32767
  )
    throw new EvaluationDefinitionError(
      'El orden debe ser un entero entre 1 y 32767',
    );
  return value;
}
/** Peso porcentual en puntos base; nunca utiliza coma flotante para validar sumas. */
export function evaluationWeightBasisPoints(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,2})?$/.test(value))
    throw new EvaluationDefinitionError(
      'El peso debe ser texto decimal con punto y hasta dos decimales',
    );
  const [whole, fraction = ''] = value.split('.');
  const weight = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (weight <= 0n || weight > 10000n)
    throw new EvaluationDefinitionError(
      'El peso debe ser mayor que 0 y no superar 100',
    );
  return weight;
}
function percentage(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
function unique<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new EvaluationDefinitionError(`${label} no admite duplicados`);
}
function unitId(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new EvaluationDefinitionError(
      'La unidad debe ser un identificador válido o null',
    );
  return value;
}

/** B16/RF38: un borrador incompleto es válido; sus entradas presentes deben ser coherentes. */
export function normalizeEvaluationDefinition(
  input: EvaluationDefinition,
): EvaluationDefinition {
  const definition = object(input, ['evaluaciones']);
  if (
    !Array.isArray(definition.evaluaciones) ||
    definition.evaluaciones.length > 20
  )
    throw new EvaluationDefinitionError(
      'La definición admite como máximo 20 evaluaciones',
    );
  let indicators = 0;
  const components = definition.evaluaciones.map((value: unknown) => {
    const component = object(value, [
      'nombre',
      'unidadId',
      'pesoPct',
      'orden',
      'indicadores',
    ]);
    if (
      !Array.isArray(component.indicadores) ||
      component.indicadores.length > 30
    )
      throw new EvaluationDefinitionError(
        'Cada evaluación admite como máximo 30 indicadores',
      );
    const entries = component.indicadores.map((item: unknown) => {
      const indicator = object(item, [
        'codigo',
        'descripcion',
        'pesoPct',
        'orden',
      ]);
      return {
        codigo: text(indicator.codigo, 20, 'El código del indicador'),
        descripcion: text(
          indicator.descripcion,
          250,
          'La descripción del indicador',
        ),
        pesoPct: percentage(evaluationWeightBasisPoints(indicator.pesoPct)),
        orden: order(indicator.orden),
      };
    });
    indicators += entries.length;
    unique(
      entries.map((entry) => entry.codigo),
      'El código dentro de una evaluación',
    );
    unique(
      entries.map((entry) => entry.orden),
      'El orden dentro de una evaluación',
    );
    return {
      nombre: text(component.nombre, 120, 'El nombre de la evaluación'),
      unidadId: unitId(component.unidadId),
      pesoPct: percentage(evaluationWeightBasisPoints(component.pesoPct)),
      orden: order(component.orden),
      indicadores: entries.sort((left, right) => left.orden - right.orden),
    };
  });
  if (indicators > 100)
    throw new EvaluationDefinitionError(
      'La definición admite como máximo 100 indicadores en total',
    );
  unique(
    components.map((component) => component.nombre),
    'El nombre de la evaluación',
  );
  unique(
    components.map((component) => component.orden),
    'El orden de las evaluaciones',
  );
  return {
    evaluaciones: components.sort((left, right) => left.orden - right.orden),
  };
}

export function validateEvaluationDefinition(
  definition: EvaluationDefinition,
): EvaluationValidation {
  const normalized = normalizeEvaluationDefinition(definition);
  const errors: string[] = [];
  const total = normalized.evaluaciones.reduce(
    (sum, component) => sum + evaluationWeightBasisPoints(component.pesoPct),
    0n,
  );
  if (!normalized.evaluaciones.length)
    errors.push('Agrega al menos una evaluación');
  if (total !== 10000n)
    errors.push(
      'Los pesos de las evaluaciones deben sumar exactamente 100.00 %',
    );
  let indicators = 0;
  for (const component of normalized.evaluaciones) {
    indicators += component.indicadores.length;
    if (!component.indicadores.length)
      errors.push(`${component.nombre}: agrega al menos un indicador`);
    const weight = component.indicadores.reduce(
      (sum, indicator) => sum + evaluationWeightBasisPoints(indicator.pesoPct),
      0n,
    );
    if (weight !== 10000n)
      errors.push(
        `${component.nombre}: los pesos de sus indicadores deben sumar exactamente 100.00 %`,
      );
  }
  return {
    completa: errors.length === 0,
    pesoTotalPct: percentage(total),
    evaluaciones: normalized.evaluaciones.length,
    indicadores: indicators,
    errores: errors,
  };
}

/** Diagnóstico para B18: una nota cero es un registro; no se crea ni cierra un acta aquí. */
export function gradeClosureReadiness(
  criteriosAprobados: boolean,
  matriculasRevisables: number,
  indicadores: number,
  calificacionesRegistradas: number,
): GradeReadiness {
  if (typeof criteriosAprobados !== 'boolean')
    throw new EvaluationDefinitionError(
      'El estado de los criterios debe ser booleano',
    );
  for (const count of [
    matriculasRevisables,
    indicadores,
    calificacionesRegistradas,
  ])
    if (!Number.isSafeInteger(count) || count < 0)
      throw new EvaluationDefinitionError(
        'Los conteos de preparación deben ser enteros no negativos',
      );
  const expected = matriculasRevisables * indicadores;
  if (!Number.isSafeInteger(expected) || calificacionesRegistradas > expected)
    throw new EvaluationDefinitionError(
      'El conteo de calificaciones no corresponde a la estructura revisada',
    );
  const pending = expected - calificacionesRegistradas;
  const reasons: string[] = [];
  if (!criteriosAprobados)
    reasons.push('No hay criterios aprobados aplicados al grupo');
  if (!matriculasRevisables)
    reasons.push('No hay matrículas activas o cerradas para evaluar');
  if (!indicadores) reasons.push('No hay indicadores de evaluación aplicados');
  if (pending > 0) reasons.push('Hay calificaciones pendientes de registro');
  return {
    criteriosAprobados,
    matriculasRevisables,
    indicadores,
    calificacionesEsperadas: expected,
    calificacionesRegistradas,
    calificacionesPendientes: pending,
    puedeCerrar: reasons.length === 0,
    motivos: reasons,
  };
}
