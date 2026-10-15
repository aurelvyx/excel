import {
  EvaluationDefinitionError,
  evaluationWeightBasisPoints,
  gradeClosureReadiness,
  normalizeEvaluationDefinition,
  validateEvaluationDefinition,
  type EvaluationComponent,
  type EvaluationDefinition,
  type EvaluationIndicator,
} from './evaluation.policy.js';

const indicator = (index = 1, pesoPct = '100'): EvaluationIndicator => ({
  codigo: `IND-${index}`,
  descripcion: `Criterio sintético ${index}`,
  pesoPct,
  orden: index,
});
const component = (
  index = 1,
  pesoPct = '100',
  indicadores = [indicator()],
): EvaluationComponent => ({
  nombre: `Evaluación sintética ${index}`,
  unidadId: null,
  pesoPct,
  orden: index,
  indicadores,
});
const definition = (evaluaciones = [component()]): EvaluationDefinition => ({
  evaluaciones,
});

describe('B16 criterios de evaluación — RF38 / CU14', () => {
  it('admite un borrador vacío y distingue su preparación incompleta de una aprobación', () => {
    expect(normalizeEvaluationDefinition(definition([]))).toEqual({
      evaluaciones: [],
    });
    expect(validateEvaluationDefinition(definition([]))).toMatchObject({
      completa: false,
      pesoTotalPct: '0.00',
      evaluaciones: 0,
      indicadores: 0,
      errores: expect.arrayContaining(['Agrega al menos una evaluación']),
    });
  });

  it('normaliza texto, pesos y orden sin modificar el borrador original', () => {
    const input = definition([
      {
        ...component(2, '33.3'),
        nombre: ' Evaluación segunda ',
        indicadores: [
          indicator(2, '25'),
          {
            ...indicator(1, '75'),
            codigo: ' IND-1 ',
            descripcion: ' Criterio primero ',
          },
        ],
      },
      component(1, '66.7'),
    ]);
    const original = structuredClone(input);
    const normalized = normalizeEvaluationDefinition(input);
    expect(input).toEqual(original);
    expect(
      normalized.evaluaciones.map((entry) => [entry.orden, entry.pesoPct]),
    ).toEqual([
      [1, '66.70'],
      [2, '33.30'],
    ]);
    expect(normalized.evaluaciones[1]!.indicadores[0]).toEqual({
      codigo: 'IND-1',
      descripcion: 'Criterio primero',
      pesoPct: '75.00',
      orden: 1,
    });
    expect(normalized.evaluaciones[1]!.nombre).toBe('Evaluación segunda');
    expect(validateEvaluationDefinition(normalized).completa).toBe(true);
  });

  it('suma 33.33 + 33.33 + 33.34 exactamente en evaluaciones y en cada conjunto de indicadores', () => {
    const weights = ['33.33', '33.33', '33.34'];
    const input = definition(
      weights.map((weight, index) =>
        component(
          index + 1,
          weight,
          weights.map((value, entry) => indicator(entry + 1, value)),
        ),
      ),
    );
    expect(validateEvaluationDefinition(input)).toEqual({
      completa: true,
      pesoTotalPct: '100.00',
      evaluaciones: 3,
      indicadores: 9,
      errores: [],
    });
    expect(evaluationWeightBasisPoints('33.33')).toBe(3333n);
    expect(evaluationWeightBasisPoints('0.01')).toBe(1n);
  });

  it.each([
    ['49.99', '50', '99.99'],
    ['50.01', '50', '100.01'],
  ])(
    'conserva borrador con pesos %s + %s pero no lo considera aprobable',
    (first, second, total) => {
      const input = definition([component(1, first), component(2, second)]);
      expect(() => normalizeEvaluationDefinition(input)).not.toThrow();
      expect(validateEvaluationDefinition(input)).toMatchObject({
        completa: false,
        pesoTotalPct: total,
        errores: expect.arrayContaining([
          'Los pesos de las evaluaciones deben sumar exactamente 100.00 %',
        ]),
      });
    },
  );

  it.each(['49.99', '50.01'])(
    'requiere suma exacta en indicadores aun cuando el total de evaluaciones es 100: %s',
    (weight) => {
      const input = definition([
        component(1, '100', [indicator(1, weight), indicator(2, '50')]),
      ]);
      const validation = validateEvaluationDefinition(input);
      expect(validation).toMatchObject({
        completa: false,
        pesoTotalPct: '100.00',
        evaluaciones: 1,
        indicadores: 2,
      });
      expect(validation.errores).toHaveLength(1);
      expect(validation.errores[0]).toContain(
        'sus indicadores deben sumar exactamente',
      );
    },
  );

  it('permite capturar evaluación sin indicadores y exige completarla antes de aprobar', () => {
    const input = definition([component(1, '100', [])]);
    expect(
      normalizeEvaluationDefinition(input).evaluaciones[0]!.indicadores,
    ).toEqual([]);
    expect(validateEvaluationDefinition(input)).toMatchObject({
      completa: false,
      indicadores: 0,
    });
  });

  it('acepta hasta 100 indicadores y permite el mismo código en evaluaciones diferentes', () => {
    const input = definition(
      Array.from({ length: 4 }, (_, index) =>
        component(
          index + 1,
          '25',
          Array.from({ length: 25 }, (_, entry) => indicator(entry + 1, '4')),
        ),
      ),
    );
    expect(validateEvaluationDefinition(input)).toMatchObject({
      completa: true,
      evaluaciones: 4,
      indicadores: 100,
    });
  });

  it('respeta los límites de evaluaciones, indicadores por evaluación y total', () => {
    expect(() =>
      normalizeEvaluationDefinition(
        definition(
          Array.from({ length: 21 }, (_, index) => component(index + 1)),
        ),
      ),
    ).toThrow('20 evaluaciones');
    expect(() =>
      normalizeEvaluationDefinition(
        definition([
          component(
            1,
            '100',
            Array.from({ length: 31 }, (_, index) => indicator(index + 1)),
          ),
        ]),
      ),
    ).toThrow('30 indicadores');
    expect(() =>
      normalizeEvaluationDefinition(
        definition(
          Array.from({ length: 4 }, (_, index) =>
            component(
              index + 1,
              '25',
              Array.from({ length: index === 0 ? 26 : 25 }, (_, entry) =>
                indicator(entry + 1, '4'),
              ),
            ),
          ),
        ),
      ),
    ).toThrow('100 indicadores');
  });

  it.each([
    '',
    '0',
    '0.00',
    '100.01',
    '101',
    '1,5',
    '1e2',
    '+1',
    '-1',
    ' 1 ',
    '.5',
    '1.',
    '1.001',
    'NaN',
    'Infinity',
    50,
    null,
  ])('rechaza un peso inválido sin convertirlo o redondearlo: %s', (weight) => {
    expect(() => evaluationWeightBasisPoints(weight)).toThrow(
      EvaluationDefinitionError,
    );
  });

  it('rechaza duplicados de nombres y órdenes entre evaluaciones', () => {
    expect(() =>
      normalizeEvaluationDefinition(
        definition([
          component(1, '50'),
          { ...component(2, '50'), nombre: ' Evaluación sintética 1 ' },
        ]),
      ),
    ).toThrow('El nombre');
    expect(() =>
      normalizeEvaluationDefinition(
        definition([component(1, '50'), { ...component(2, '50'), orden: 1 }]),
      ),
    ).toThrow('El orden');
  });

  it('rechaza duplicados de códigos y órdenes dentro de una evaluación', () => {
    expect(() =>
      normalizeEvaluationDefinition(
        definition([
          component(1, '100', [
            indicator(1, '50'),
            { ...indicator(2, '50'), codigo: ' IND-1 ' },
          ]),
        ]),
      ),
    ).toThrow('El código');
    expect(() =>
      normalizeEvaluationDefinition(
        definition([
          component(1, '100', [
            indicator(1, '50'),
            { ...indicator(2, '50'), orden: 1 },
          ]),
        ]),
      ),
    ).toThrow('El orden');
  });

  it.each([0, -1, 1.5, 32768, Number.NaN, '1'])(
    'valida orden entero en evaluación e indicador: %s',
    (invalid) => {
      expect(() =>
        normalizeEvaluationDefinition(
          definition([{ ...component(), orden: invalid as number }]),
        ),
      ).toThrow('El orden');
      expect(() =>
        normalizeEvaluationDefinition(
          definition([
            component(1, '100', [{ ...indicator(), orden: invalid as number }]),
          ]),
        ),
      ).toThrow('El orden');
    },
  );

  it('permite unidad null o BIGINT positivo y rechaza referencias numéricas, negativas o desbordadas', () => {
    expect(
      normalizeEvaluationDefinition(
        definition([{ ...component(), unidadId: '9223372036854775807' }]),
      ).evaluaciones[0]!.unidadId,
    ).toBe('9223372036854775807');
    for (const value of ['0', '-1', '01', '9223372036854775808', 1, undefined])
      expect(() =>
        normalizeEvaluationDefinition(
          definition([{ ...component(), unidadId: value as string }]),
        ),
      ).toThrow('La unidad');
  });

  it('rechaza estructuras, campos y tipos que no pertenecen al contrato', () => {
    for (const input of [
      null,
      [],
      {},
      { evaluaciones: null },
      { evaluaciones: [], extra: true },
      { evaluaciones: [{ ...component(), extra: true }] },
      {
        evaluaciones: [
          component(1, '100', [
            { ...indicator(), extra: true } as EvaluationIndicator,
          ]),
        ],
      },
    ])
      expect(() =>
        normalizeEvaluationDefinition(input as EvaluationDefinition),
      ).toThrow(EvaluationDefinitionError);
  });

  it('valida textos obligatorios y longitudes en evaluaciones e indicadores', () => {
    for (const name of ['', '  ', 'x'.repeat(121)])
      expect(() =>
        normalizeEvaluationDefinition(
          definition([{ ...component(), nombre: name }]),
        ),
      ).toThrow('El nombre');
    for (const code of ['', '  ', 'x'.repeat(21)])
      expect(() =>
        normalizeEvaluationDefinition(
          definition([component(1, '100', [{ ...indicator(), codigo: code }])]),
        ),
      ).toThrow('El código');
    for (const description of ['', '  ', 'x'.repeat(251)])
      expect(() =>
        normalizeEvaluationDefinition(
          definition([
            component(1, '100', [{ ...indicator(), descripcion: description }]),
          ]),
        ),
      ).toThrow('La descripción');
  });
});

describe('B16 preparación de acta para B18', () => {
  it('diagnostica notas pendientes sin emitir un acta ni completar ceros', () => {
    expect(gradeClosureReadiness(true, 2, 3, 5)).toMatchObject({
      criteriosAprobados: true,
      calificacionesEsperadas: 6,
      calificacionesRegistradas: 5,
      calificacionesPendientes: 1,
      puedeCerrar: false,
      motivos: ['Hay calificaciones pendientes de registro'],
    });
  });

  it('considera un registro con nota cero como calificación existente', () => {
    // El servicio cuenta la existencia del registro, independientemente del valor de la nota.
    expect(gradeClosureReadiness(true, 1, 1, 1)).toEqual({
      criteriosAprobados: true,
      matriculasRevisables: 1,
      indicadores: 1,
      calificacionesEsperadas: 1,
      calificacionesRegistradas: 1,
      calificacionesPendientes: 0,
      puedeCerrar: true,
      motivos: [],
    });
  });

  it('sin criterios aprobados no declara preparación aunque ya existan todas las notas', () => {
    expect(gradeClosureReadiness(false, 2, 1, 2)).toMatchObject({
      calificacionesPendientes: 0,
      puedeCerrar: false,
      motivos: ['No hay criterios aprobados aplicados al grupo'],
    });
  });

  it('sin matrículas o indicadores no confunde cero pendientes con un acta preparada', () => {
    expect(gradeClosureReadiness(true, 0, 3, 0)).toMatchObject({
      puedeCerrar: false,
      motivos: ['No hay matrículas activas o cerradas para evaluar'],
    });
    expect(gradeClosureReadiness(true, 2, 0, 0)).toMatchObject({
      puedeCerrar: false,
      motivos: ['No hay indicadores de evaluación aplicados'],
    });
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rechaza conteos inválidos: %s', (invalid) => {
    expect(() => gradeClosureReadiness(true, invalid, 1, 0)).toThrow(
      EvaluationDefinitionError,
    );
    expect(() => gradeClosureReadiness(true, 1, invalid, 0)).toThrow(
      EvaluationDefinitionError,
    );
    expect(() => gradeClosureReadiness(true, 1, 1, invalid)).toThrow(
      EvaluationDefinitionError,
    );
  });

  it('rechaza registros excedentes o producto que no pueda contarse con precisión', () => {
    expect(() => gradeClosureReadiness(true, 1, 1, 2)).toThrow(
      'no corresponde',
    );
    expect(() =>
      gradeClosureReadiness(true, Number.MAX_SAFE_INTEGER, 2, 0),
    ).toThrow('no corresponde');
    expect(() =>
      gradeClosureReadiness('true' as unknown as boolean, 1, 1, 1),
    ).toThrow('booleano');
  });
});
