import { calculateAttendance } from '../asistencia/attendance-calculation.policy.js';
import { calculateGradeAverage } from './grade.policy.js';
import { determineAcademicResult, type ResultInput } from './result.policy.js';

const attendance = (faltas = 3, tardanzas = 0) =>
  calculateAttendance(
    {
      sesionesComputables: 10,
      presentes: 10 - faltas - tardanzas,
      faltas,
      tardanzas,
      marcasPendientes: 0,
      justificadasPendientes: 0,
      justificadasRecuperadas: 0,
      justificadasRechazadas: 0,
      justificadasNoRecuperadas: 0,
    },
    {
      parametroId: '1',
      version: 1,
      inasistenciaMaxPct: '30.00',
      tardanzasPorFalta: 3,
    },
    'ACTIVA',
    true,
  );
const input = (): ResultInput => ({
  resumenAsistencia: attendance(),
  resumenNotas: {
    configuracionAprobada: true,
    calificacionesEsperadas: 1,
    calificacionesPendientes: 0,
    promedio: '12.50',
    notaOficial: 13,
  },
  notaMinima: '13.00',
});

describe('B18 resultado académico — RF43 / RN13–14 / RN24–26', () => {
  it.each([
    [0, 'DESAPROBADO'],
    [12, 'DESAPROBADO'],
    [13, 'APROBADO'],
    [20, 'APROBADO'],
  ])('30 %% exacto y nota oficial %s determina %s', (nota, condicion) => {
    const value = input();
    value.resumenNotas!.notaOficial = nota;
    value.resumenNotas!.promedio = `${nota}.00`;
    expect(determineAcademicResult(value)).toEqual({
      condicion,
      listo: true,
      pendientes: [],
    });
  });

  it.each([0, 12, 13, 20])('más del 30 %% prevalece sobre nota %s', (nota) => {
    const value = input();
    value.resumenAsistencia = attendance(4);
    value.resumenNotas!.notaOficial = nota;
    expect(determineAcademicResult(value).condicion).toBe(
      'RETIRADO_INASISTENCIA',
    );
  });

  it('conserva tres tardanzas como una falta y las restantes sin reescribir marcas', () => {
    const value = input();
    value.resumenAsistencia = attendance(3, 4);
    expect(value.resumenAsistencia).toMatchObject({
      faltasComputables: 4,
      faltasPorTardanzas: 1,
      tardanzasRestantes: 1,
    });
    expect(determineAcademicResult(value).condicion).toBe(
      'RETIRADO_INASISTENCIA',
    );
  });

  it('un porcentaje mostrado como 30.00 puede exceder el límite exacto', () => {
    const value = input();
    value.resumenAsistencia = calculateAttendance(
      {
        sesionesComputables: 100001,
        presentes: 70000,
        faltas: 30001,
        tardanzas: 0,
        marcasPendientes: 0,
        justificadasPendientes: 0,
        justificadasRecuperadas: 0,
        justificadasRechazadas: 0,
        justificadasNoRecuperadas: 0,
      },
      {
        parametroId: '1',
        version: 1,
        inasistenciaMaxPct: '30',
        tardanzasPorFalta: 3,
      },
      'CERRADA',
      true,
    );
    expect(value.resumenAsistencia).toMatchObject({
      inasistenciaPct: '30.00',
      excedeLimite: true,
    });
    expect(determineAcademicResult(value).condicion).toBe(
      'RETIRADO_INASISTENCIA',
    );
  });

  it.each([
    ['justificadasPendientes', 'RETIRADO_INASISTENCIA'],
    ['justificadasRecuperadas', 'APROBADO'],
    ['justificadasRechazadas', 'RETIRADO_INASISTENCIA'],
    ['justificadasNoRecuperadas', 'RETIRADO_INASISTENCIA'],
  ] as const)(
    'el cierre conserva el efecto de %s',
    (justification, condicion) => {
      const value = input();
      const totals = {
        sesionesComputables: 10,
        presentes: 6,
        faltas: 3,
        tardanzas: 0,
        marcasPendientes: 0,
        justificadasPendientes: 0,
        justificadasRecuperadas: 0,
        justificadasRechazadas: 0,
        justificadasNoRecuperadas: 0,
      };
      totals[justification] = 1;
      value.resumenAsistencia = calculateAttendance(
        totals,
        {
          parametroId: '1',
          version: 1,
          inasistenciaMaxPct: '30',
          tardanzasPorFalta: 3,
        },
        'CERRADA',
        true,
      );
      expect(determineAcademicResult(value).condicion).toBe(condicion);
      expect(totals[justification]).toBe(1);
    },
  );

  it.each([
    ['12.4', 12, 'DESAPROBADO'],
    ['12.5', 13, 'APROBADO'],
    ['0', 0, 'DESAPROBADO'],
  ])(
    'usa el redondeo exacto de B17: %s → %s → %s',
    (nota, oficial, condicion) => {
      const value = input();
      value.resumenNotas = {
        configuracionAprobada: true,
        ...calculateGradeAverage(
          'PONDERADA_JERARQUICA_V1',
          {
            evaluaciones: [
              {
                nombre: 'Sintética',
                unidadId: null,
                pesoPct: '100',
                orden: 1,
                indicadores: [
                  {
                    codigo: 'SYN',
                    descripcion: 'Sintético',
                    pesoPct: '100',
                    orden: 1,
                  },
                ],
              },
            ],
          },
          [{ evaluacionOrden: 1, indicadorOrden: 1, nota }],
        ),
      };
      expect(value.resumenNotas.notaOficial).toBe(oficial);
      expect(determineAcademicResult(value).condicion).toBe(condicion);
    },
  );

  it('respeta la nota mínima del intento en lugar de una versión futura', () => {
    const value = input();
    value.notaMinima = '13.01';
    expect(determineAcademicResult(value).condicion).toBe('DESAPROBADO');
    value.notaMinima = '13.00';
    expect(determineAcademicResult(value).condicion).toBe('APROBADO');
  });

  it('prepara un resultado calculado con asistencia abierta sin confirmar el acta', () => {
    const value = input();
    value.resumenAsistencia!.cierreConfirmado = false;
    expect(determineAcademicResult(value)).toEqual({
      condicion: 'APROBADO',
      listo: true,
      pendientes: [],
    });
  });

  const pending: [string, (value: ResultInput) => void][] = [
    [
      'sin asistencia',
      (v) => {
        v.resumenAsistencia = null;
      },
    ],
    [
      'sin sesiones',
      (v) => {
        v.resumenAsistencia!.sesionesComputables = 0;
        v.resumenAsistencia!.estado = 'SIN_SESIONES';
      },
    ],
    [
      'marcas pendientes',
      (v) => {
        v.resumenAsistencia!.marcasPendientes = 1;
      },
    ],
    [
      'cálculo provisional',
      (v) => {
        v.resumenAsistencia!.estado = 'PROVISIONAL';
      },
    ],
    [
      'intento no aplicable',
      (v) => {
        v.resumenAsistencia!.estado = 'NO_APLICA';
      },
    ],
    [
      'sin comparación exacta',
      (v) => {
        v.resumenAsistencia!.excedeLimite = null;
      },
    ],
    [
      'sin notas',
      (v) => {
        v.resumenNotas = null;
      },
    ],
    [
      'sin aprobación',
      (v) => {
        v.resumenNotas!.configuracionAprobada = false;
      },
    ],
    [
      'sin indicadores',
      (v) => {
        v.resumenNotas!.calificacionesEsperadas = 0;
      },
    ],
    [
      'nota pendiente',
      (v) => {
        v.resumenNotas!.calificacionesPendientes = 1;
      },
    ],
    [
      'promedio pendiente',
      (v) => {
        v.resumenNotas!.promedio = null;
      },
    ],
    [
      'oficial pendiente',
      (v) => {
        v.resumenNotas!.notaOficial = null;
      },
    ],
    [
      'sin regla',
      (v) => {
        v.notaMinima = null;
      },
    ],
  ];
  it.each(pending)(
    '%s no confirma condición aunque se supere el límite',
    (_label, change) => {
      const value = input();
      value.resumenAsistencia = attendance(4);
      change(value);
      expect(determineAcademicResult(value)).toMatchObject({
        condicion: null,
        listo: false,
      });
      expect(determineAcademicResult(value).pendientes.length).toBeGreaterThan(
        0,
      );
    },
  );

  it.each(['', '13,00', '1e1', '-1', '21', '13.001', ' 13', '+13'])(
    'regla inválida %s queda pendiente',
    (minimum) => {
      const value = input();
      value.notaMinima = minimum;
      expect(determineAcademicResult(value).listo).toBe(false);
    },
  );

  it('no modifica los resúmenes ni consume una condición redondeada del frontend', () => {
    const value = input();
    const before = structuredClone(value);
    expect(determineAcademicResult(value).condicion).toBe('APROBADO');
    expect(value).toEqual(before);
    expect(determineAcademicResult(value)).toEqual(
      determineAcademicResult(value),
    );
  });
});
