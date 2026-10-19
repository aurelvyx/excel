import {
  justificationReadOnlyReason,
  justificationStates,
  justificationTransition,
  JustificationConflict,
  validateJustificationPresentation,
} from './justification.policy.js';

const open = {
  groupState: 'ACTIVO',
  periodState: 'ABIERTO',
  enrollmentState: 'ACTIVA',
  sessionState: 'REALIZADA',
  sessionDate: '2026-10-05',
  today: '2026-10-07',
};

describe('B14 justificaciones — RF33–35 / RN15–20', () => {
  it.each([
    ['PENDIENTE', 'APROBADA'],
    ['PENDIENTE', 'RECHAZADA'],
    ['APROBADA', 'RECUPERADA'],
    ['APROBADA', 'NO_RECUPERADA'],
  ] as const)('permite %s → %s con versión vigente', (before, after) => {
    expect(justificationTransition(before, after, 2, 2)).toBe(after);
  });

  it('rechaza todo salto, reapertura o cambio de un estado terminal', () => {
    const allowed = new Set([
      'PENDIENTE:APROBADA',
      'PENDIENTE:RECHAZADA',
      'APROBADA:RECUPERADA',
      'APROBADA:NO_RECUPERADA',
    ]);
    for (const previous of justificationStates)
      for (const next of justificationStates)
        if (!allowed.has(`${previous}:${next}`))
          expect(() => justificationTransition(previous, next, 1, 1)).toThrow(
            JustificationConflict,
          );
  });

  it.each([
    [1, 2],
    [2, 1],
    [0, 1],
    [-1, 1],
    [1.5, 1.5],
    [Number.NaN, 1],
    [1, Number.POSITIVE_INFINITY],
    [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1],
  ])('rechaza versión esperada %s frente a vigente %s', (expected, current) => {
    expect(() =>
      justificationTransition('PENDIENTE', 'APROBADA', expected!, current!),
    ).toThrow(JustificationConflict);
  });

  it('admite los extremos inclusivos de recepción y una fecha intermedia', () => {
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07'])
      expect(() =>
        validateJustificationPresentation(date, open.sessionDate, open.today),
      ).not.toThrow();
    expect(() =>
      validateJustificationPresentation(
        '2028-02-29',
        '2028-02-28',
        '2028-03-01',
      ),
    ).not.toThrow();
  });

  it.each(['2026-10-04', '2026-10-08'])(
    'rechaza presentación fuera del intervalo %s',
    (date) => {
      expect(() =>
        validateJustificationPresentation(date, open.sessionDate, open.today),
      ).toThrow('entre la fecha de clase y hoy');
    },
  );

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-10-00',
    '0000-10-05',
    '2026-1-5',
    '05/10/2026',
    '2026-10-05T00:00:00Z',
    '',
  ])('rechaza fecha mal formada o inexistente %s', (date) => {
    expect(() =>
      validateJustificationPresentation(date, open.sessionDate, open.today),
    ).toThrow('fecha válida YYYY-MM-DD');
  });

  it('valida también las fechas que proporcionan el contexto', () => {
    expect(() =>
      validateJustificationPresentation('2026-10-06', '2026-02-30', open.today),
    ).toThrow();
    expect(() =>
      validateJustificationPresentation(
        '2026-10-06',
        open.sessionDate,
        '2026-13-01',
      ),
    ).toThrow();
  });

  it('admite gestionar una J de una sesión pasada o de hoy con contexto abierto', () => {
    expect(justificationReadOnlyReason(open)).toBeNull();
    expect(
      justificationReadOnlyReason({ ...open, sessionDate: open.today }),
    ).toBeNull();
  });

  it.each([
    { groupState: 'CERRADO' },
    { groupState: 'PLANIFICADO' },
    { periodState: 'CERRADO' },
    { periodState: 'PLANIFICADO' },
    { enrollmentState: 'PENDIENTE' },
    { enrollmentState: 'ANULADA' },
    { enrollmentState: 'CERRADA' },
    { sessionState: 'PROGRAMADA' },
    { sessionState: 'CANCELADA' },
    { sessionDate: '2026-10-08' },
    { sessionDate: '2026-02-30' },
    { today: '2026-13-01' },
  ])('conserva solo lectura ante %j', (closed) => {
    expect(justificationReadOnlyReason({ ...open, ...closed })).toBeTruthy();
  });
});
