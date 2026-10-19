import {
  calculateGradeAverage,
  GradePolicyError,
  normalizeGrade,
  type GradeValue,
} from './grade.policy.js';
import type { EvaluationDefinition } from './evaluation.policy.js';

const formula = 'PONDERADA_JERARQUICA_V1';
/** Datos de prueba; los porcentajes no representan una política institucional. */
const definition = (
  evaluationWeights = ['100'],
  indicatorWeights = ['100'],
): EvaluationDefinition => ({
  evaluaciones: evaluationWeights.map((pesoPct, index) => ({
    nombre: `Evaluación sintética ${index + 1}`,
    unidadId: null,
    pesoPct,
    orden: index + 1,
    indicadores: indicatorWeights.map((weight, entry) => ({
      codigo: `SYN-${entry + 1}`,
      descripcion: `Indicador sintético ${entry + 1}`,
      pesoPct: weight,
      orden: entry + 1,
    })),
  })),
});
const grade = (
  nota: string | null,
  evaluacionOrden = 1,
  indicadorOrden = 1,
): GradeValue => ({ evaluacionOrden, indicadorOrden, nota });

describe('B17 notas decimales y promedio — RF39–42 / CU15', () => {
  it.each([
    ['0', '0.00'],
    ['00', '0.00'],
    ['00.01', '0.01'],
    ['7', '7.00'],
    ['7.1', '7.10'],
    ['12.40', '12.40'],
    ['19.99', '19.99'],
    ['20', '20.00'],
    ['20.00', '20.00'],
  ])('normaliza %s a %s sin perder precisión', (input, expected) => {
    expect(normalizeGrade(input)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    ' 12.4',
    '12.4 ',
    '-1',
    '-0',
    '+1',
    '20.01',
    '21',
    '100',
    '.5',
    '1.',
    '1.001',
    '1,5',
    '1e1',
    'NaN',
    'Infinity',
    null,
    undefined,
    0,
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    {},
    [],
  ])('rechaza nota fuera del contrato decimal: %s', (input) => {
    expect(() => normalizeGrade(input)).toThrow(GradePolicyError);
  });

  it.each([
    ['0', '0.00', 0],
    ['0.49', '0.49', 0],
    ['0.50', '0.50', 1],
    ['12.40', '12.40', 12],
    ['12.49', '12.49', 12],
    ['12.50', '12.50', 13],
    ['12.51', '12.51', 13],
    ['19.50', '19.50', 20],
    ['20.00', '20.00', 20],
  ])(
    'nota %s produce promedio %s y nota oficial %s',
    (nota, promedio, official) => {
      expect(
        calculateGradeAverage(formula, definition(), [grade(nota)]),
      ).toEqual({
        promedio,
        notaOficial: official,
        calificacionesEsperadas: 1,
        calificacionesRegistradas: 1,
        calificacionesPendientes: 0,
      });
    },
  );

  it('no redondea dos veces: 12.495 permanece 12 y 12.505 sube a 13', () => {
    const criteria = definition(['100'], ['50', '50']);
    expect(
      calculateGradeAverage(formula, criteria, [
        grade('12.49'),
        grade('12.50', 1, 2),
      ]),
    ).toMatchObject({
      promedio: '12.495',
      notaOficial: 12,
    });
    expect(
      calculateGradeAverage(formula, criteria, [
        grade('12.50'),
        grade('12.51', 1, 2),
      ]),
    ).toMatchObject({
      promedio: '12.505',
      notaOficial: 13,
    });
  });

  it('pondera indicadores en su evaluación antes de ponderar evaluaciones', () => {
    const criteria = definition(['25', '75'], ['20', '80']);
    const grades = [
      grade('10'),
      grade('20', 1, 2),
      grade('0', 2),
      grade('10', 2, 2),
    ];
    expect(calculateGradeAverage(formula, criteria, grades)).toEqual({
      promedio: '10.50',
      notaOficial: 11,
      calificacionesEsperadas: 4,
      calificacionesRegistradas: 4,
      calificacionesPendientes: 0,
    });
  });

  it('suma 33.33 + 33.33 + 33.34 exactamente en ambos niveles', () => {
    const criteria = definition(
      ['33.33', '33.33', '33.34'],
      ['33.33', '33.33', '33.34'],
    );
    const grades = criteria.evaluaciones.flatMap((evaluation) =>
      evaluation.indicadores.map((indicator) =>
        grade('12.50', evaluation.orden, indicator.orden),
      ),
    );
    expect(calculateGradeAverage(formula, criteria, grades)).toMatchObject({
      promedio: '12.50',
      notaOficial: 13,
    });
  });

  it('conserva hasta diez decimales exactos cuando pesan dos porcentajes y centésimas', () => {
    const criteria = definition(['0.01', '99.99'], ['0.01', '99.99']);
    const grades = [
      grade('0.01'),
      grade('0', 1, 2),
      grade('0', 2),
      grade('0', 2, 2),
    ];
    expect(calculateGradeAverage(formula, criteria, grades)).toMatchObject({
      promedio: '0.0000000001',
      notaOficial: 0,
    });
  });

  it('conserva diez decimales cerca del máximo sin coma flotante', () => {
    const criteria = definition(['0.01', '99.99'], ['0.01', '99.99']);
    const grades = [
      grade('19.99'),
      grade('20', 1, 2),
      grade('20', 2),
      grade('20', 2, 2),
    ];
    expect(calculateGradeAverage(formula, criteria, grades)).toMatchObject({
      promedio: '19.9999999999',
      notaOficial: 20,
    });
  });

  it('distingue notas ausentes de cero sin producir promedio parcial', () => {
    const criteria = definition(['100'], ['50', '50']);
    expect(calculateGradeAverage(formula, criteria, [grade('0')])).toEqual({
      promedio: null,
      notaOficial: null,
      calificacionesEsperadas: 2,
      calificacionesRegistradas: 1,
      calificacionesPendientes: 1,
    });
    expect(
      calculateGradeAverage(formula, criteria, [grade('0'), grade('0', 1, 2)]),
    ).toMatchObject({
      promedio: '0.00',
      notaOficial: 0,
      calificacionesPendientes: 0,
    });
  });

  it('una nota explícitamente null también queda pendiente', () => {
    expect(
      calculateGradeAverage(formula, definition(), [grade(null)]),
    ).toMatchObject({
      promedio: null,
      notaOficial: null,
      calificacionesRegistradas: 0,
      calificacionesPendientes: 1,
    });
    expect(calculateGradeAverage(formula, definition(), [])).toMatchObject({
      promedio: null,
      notaOficial: null,
      calificacionesRegistradas: 0,
      calificacionesPendientes: 1,
    });
  });

  it('es independiente del orden de las entradas y no modifica los argumentos', () => {
    const criteria = definition(['40', '60'], ['70', '30']);
    const grades = [
      grade('10'),
      grade('20', 1, 2),
      grade('12', 2),
      grade('18', 2, 2),
    ];
    const before = structuredClone({ criteria, grades });
    const expected = calculateGradeAverage(formula, criteria, grades);
    criteria.evaluaciones
      .reverse()
      .forEach((evaluation) => evaluation.indicadores.reverse());
    expect(
      calculateGradeAverage(formula, criteria, [...grades].reverse()),
    ).toEqual(expected);
    criteria.evaluaciones
      .reverse()
      .forEach((evaluation) => evaluation.indicadores.reverse());
    expect({ criteria, grades }).toEqual(before);
  });

  it.each([
    definition([]),
    definition(['99.99']),
    definition(['100.01']),
    definition(['100'], []),
    definition(['100'], ['99.99']),
    definition(['100'], ['100.01']),
  ])('no calcula con criterios incompletos o pesos inválidos', (criteria) => {
    expect(() => calculateGradeAverage(formula, criteria, [])).toThrow(
      GradePolicyError,
    );
  });

  it.each(['', 'PROMEDIO_SIMPLE', 'PONDERADA_JERARQUICA_V2'])(
    'no sustituye la fórmula %s por una supuesta',
    (unsupported) => {
      expect(() =>
        calculateGradeAverage(unsupported, definition(), [grade('12.50')]),
      ).toThrow('no está soportada');
    },
  );

  it('rechaza notas duplicadas, incluso si una está pendiente', () => {
    expect(() =>
      calculateGradeAverage(formula, definition(), [grade('12'), grade('13')]),
    ).toThrow('más de una nota');
    expect(() =>
      calculateGradeAverage(formula, definition(), [grade(null), grade('13')]),
    ).toThrow('más de una nota');
  });

  it.each([grade('12', 2), grade('12', 1, 2), grade(null, 2)])(
    'rechaza notas de criterios ajenos',
    (invalid) => {
      expect(() =>
        calculateGradeAverage(formula, definition(), [invalid]),
      ).toThrow('criterio ajeno');
    },
  );

  it.each([
    grade('12', 0),
    grade('12', 1, 0),
    grade('12', 1.5),
    grade('12', 1, Number.NaN),
  ])('rechaza identificadores de criterio inválidos', (invalid) => {
    expect(() =>
      calculateGradeAverage(formula, definition(), [invalid]),
    ).toThrow('criterio válido');
  });

  it('rechaza notas inválidas aunque otras notas falten', () => {
    expect(() =>
      calculateGradeAverage(formula, definition(['100'], ['50', '50']), [
        grade('20.01'),
      ]),
    ).toThrow(GradePolicyError);
  });

  it('rechaza entradas de notas sin lista o sin objeto', () => {
    expect(() =>
      calculateGradeAverage(
        formula,
        definition(),
        null as unknown as GradeValue[],
      ),
    ).toThrow('lista');
    expect(() =>
      calculateGradeAverage(formula, definition(), [
        null,
      ] as unknown as GradeValue[]),
    ).toThrow('criterio válido');
  });
});
