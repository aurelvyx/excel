import {
  calculateAttendance,
  type AttendanceRules,
  type AttendanceTotals,
} from './attendance-calculation.policy.js';

const rules: AttendanceRules = {
  parametroId: '1',
  version: 1,
  inasistenciaMaxPct: '30.00',
  tardanzasPorFalta: 3,
};
function totals(values: Partial<AttendanceTotals> = {}): AttendanceTotals {
  const counts = {
    presentes: 0,
    faltas: 0,
    tardanzas: 0,
    marcasPendientes: 0,
    justificadasPendientes: 0,
    justificadasRecuperadas: 0,
    justificadasRechazadas: 0,
    justificadasNoRecuperadas: 0,
    ...values,
  };
  return {
    ...counts,
    sesionesComputables:
      values.sesionesComputables ??
      Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}
const calculate = (values: Partial<AttendanceTotals>, closed = false) =>
  calculateAttendance(totals(values), rules, 'ACTIVA', closed);

describe('B13 cálculo exacto por intento — RF31–32 / RN12–14', () => {
  it('sin sesiones no divide entre cero ni determina condición', () => {
    expect(calculate({})).toMatchObject({
      estado: 'SIN_SESIONES',
      sesionesComputables: 0,
      faltasComputables: 0,
      inasistenciaPct: null,
      excedeLimite: null,
      condicion: null,
    });
  });
  it.each([
    [1, 0, 1],
    [2, 0, 2],
    [3, 1, 0],
    [6, 2, 0],
    [7, 2, 1],
  ])(
    '%i tardanzas equivalen a %i faltas y quedan %i tardanzas',
    (late, equivalent, remaining) => {
      expect(calculate({ tardanzas: late })).toMatchObject({
        tardanzas: late,
        faltasPorTardanzas: equivalent,
        tardanzasRestantes: remaining,
        faltasComputables: equivalent,
      });
    },
  );
  it('P y tardanzas restantes mantienen la presencia inicial', () => {
    expect(calculate({ presentes: 8, tardanzas: 2 })).toMatchObject({
      estado: 'CALCULADO',
      faltasComputables: 0,
      inasistenciaPct: '0.00',
      condicion: 'DENTRO_LIMITE',
    });
  });
  it('30 % exacto permite continuar; superior al límite determina retiro', () => {
    expect(calculate({ presentes: 7, faltas: 3 })).toMatchObject({
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
    });
    expect(calculate({ presentes: 6, faltas: 4 })).toMatchObject({
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: 'RETIRADO_INASISTENCIA',
    });
  });
  it('suma faltas originales y grupos de tardanzas sin cambiar las marcas', () => {
    const input = totals({ presentes: 2, faltas: 1, tardanzas: 7 });
    const before = { ...input };
    expect(calculateAttendance(input, rules, 'ACTIVA')).toMatchObject({
      faltas: 1,
      tardanzas: 7,
      faltasPorTardanzas: 2,
      tardanzasRestantes: 1,
      faltasConfirmadas: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
    });
    expect(input).toEqual(before);
  });
  it('no usa el porcentaje mostrado para decidir en torno a 30 %', () => {
    expect(calculate({ faltas: 3001, presentes: 7002 })).toMatchObject({
      inasistenciaPct: '30.00',
      excedeLimite: true,
      condicion: 'RETIRADO_INASISTENCIA',
    });
    expect(calculate({ faltas: 2999, presentes: 6998 })).toMatchObject({
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
    });
  });
  it('redondea únicamente la presentación a dos decimales con mitad hacia arriba', () => {
    expect(calculate({ faltas: 1, presentes: 31 }).inasistenciaPct).toBe(
      '3.13',
    );
    expect(calculate({ faltas: 1, presentes: 5 }).inasistenciaPct).toBe(
      '16.67',
    );
  });
  it('una marca faltante permanece pendiente, sin convertirse en falta o presencia', () => {
    expect(calculate({ faltas: 4, marcasPendientes: 6 })).toMatchObject({
      estado: 'INCOMPLETO',
      presentes: 0,
      faltasComputables: 4,
      marcasPendientes: 6,
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: null,
    });
  });
  it('J sin resolver computa provisionalmente y no determina condición', () => {
    expect(
      calculate({ presentes: 6, justificadasPendientes: 4 }),
    ).toMatchObject({
      estado: 'PROVISIONAL',
      justificadas: 4,
      justificadasPendientes: 4,
      justificadasComputables: 4,
      faltasConfirmadas: 0,
      faltasComputables: 4,
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: null,
    });
  });
  it('J recuperada no cuenta; rechazada o confirmada no recuperada sí cuenta', () => {
    // Estados de dominio para B14; B13 todavía no ofrece estas decisiones por HTTP.
    expect(
      calculate({
        presentes: 5,
        justificadasRecuperadas: 3,
        justificadasRechazadas: 1,
        justificadasNoRecuperadas: 1,
      }),
    ).toMatchObject({
      estado: 'CALCULADO',
      justificadas: 5,
      justificadasComputables: 2,
      justificadasRecuperadas: 3,
      faltasConfirmadas: 2,
      faltasComputables: 2,
      inasistenciaPct: '20.00',
      condicion: 'DENTRO_LIMITE',
    });
  });
  it('al cierre confirmado las J no recuperadas computan como falta', () => {
    // El cierre HTTP de B15 aún no existe; no inferirlo del estado del grupo.
    expect(
      calculate({ presentes: 6, justificadasPendientes: 4 }, true),
    ).toMatchObject({
      estado: 'CALCULADO',
      cierreConfirmado: true,
      faltasConfirmadas: 4,
      faltasComputables: 4,
      condicion: 'RETIRADO_INASISTENCIA',
    });
  });
  it('el cierre no resuelve marcas pendientes', () => {
    expect(calculate({ faltas: 1, marcasPendientes: 1 }, true)).toMatchObject({
      estado: 'INCOMPLETO',
      condicion: null,
    });
  });
  it.each(['PENDIENTE', 'ANULADA'])(
    'una solicitud %s no se clasifica como retirada',
    (state) => {
      expect(
        calculateAttendance(totals({ faltas: 10 }), rules, state),
      ).toMatchObject({
        estado: 'NO_APLICA',
        faltasComputables: 10,
        inasistenciaPct: null,
        excedeLimite: null,
        condicion: null,
      });
    },
  );
  it('consulta un intento cerrado sin asumir cierre de asistencia', () => {
    expect(
      calculateAttendance(
        totals({ justificadasPendientes: 1 }),
        rules,
        'CERRADA',
      ),
    ).toMatchObject({
      estado: 'PROVISIONAL',
      cierreConfirmado: false,
      condicion: null,
    });
  });
  it('aplica la versión proporcionada y no modifica reglas históricas', () => {
    const input = totals({ presentes: 6, faltas: 4 });
    const futureSynthetic = {
      ...rules,
      parametroId: '2',
      version: 2,
      inasistenciaMaxPct: '40',
      tardanzasPorFalta: 4,
    };
    expect(calculateAttendance(input, futureSynthetic, 'ACTIVA')).toMatchObject(
      {
        condicion: 'DENTRO_LIMITE',
        reglas: { version: 2, inasistenciaMaxPct: '40.00' },
      },
    );
    expect(calculateAttendance(input, rules, 'ACTIVA')).toMatchObject({
      condicion: 'RETIRADO_INASISTENCIA',
      reglas: { version: 1, inasistenciaMaxPct: '30.00' },
    });
    expect(futureSynthetic.inasistenciaMaxPct).toBe('40');
    expect(rules.tardanzasPorFalta).toBe(3);
  });
  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza conteo inválido %s',
    (value) => {
      expect(() => calculate({ faltas: value })).toThrow();
    },
  );
  it('rechaza conteos que no corresponden a las sesiones computables', () => {
    expect(() =>
      calculate({ sesionesComputables: 10, presentes: 11 }),
    ).toThrow();
  });
  it.each(['-1', '100.01', '30.001', 'NaN', '3e1', ''])(
    'rechaza máximo inválido %s',
    (maximum) => {
      expect(() =>
        calculateAttendance(
          totals(),
          { ...rules, inasistenciaMaxPct: maximum },
          'ACTIVA',
        ),
      ).toThrow();
    },
  );
  it('rechaza equivalencia cero y versión no positiva', () => {
    expect(() =>
      calculateAttendance(
        totals(),
        { ...rules, tardanzasPorFalta: 0 },
        'ACTIVA',
      ),
    ).toThrow();
    expect(() =>
      calculateAttendance(totals(), { ...rules, version: 0 }, 'ACTIVA'),
    ).toThrow();
  });
});
