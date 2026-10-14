import type { SchemaObject } from '@nestjs/swagger';

const count: SchemaObject = { type: 'integer', minimum: 0 };
export const attendanceSummarySchema: SchemaObject = {
  type: 'object',
  description:
    'B13: proyección de asistencia guardada del intento. No confirma acta ni resultado de notas. INCOMPLETO/PROVISIONAL nunca determinan condición; el porcentaje mostrado puede ser parcial o provisional.',
  required: [
    'estado',
    'sesionesComputables',
    'presentes',
    'faltas',
    'tardanzas',
    'justificadas',
    'marcasPendientes',
    'faltasPorTardanzas',
    'tardanzasRestantes',
    'justificadasPendientes',
    'justificadasRecuperadas',
    'justificadasComputables',
    'faltasConfirmadas',
    'faltasComputables',
    'inasistenciaPct',
    'excedeLimite',
    'condicion',
    'reglas',
    'cierreConfirmado',
    'criterioSesiones',
    'fechaCorte',
  ],
  properties: {
    estado: {
      type: 'string',
      enum: [
        'NO_APLICA',
        'SIN_SESIONES',
        'INCOMPLETO',
        'PROVISIONAL',
        'CALCULADO',
      ],
    },
    ...Object.fromEntries(
      [
        'sesionesComputables',
        'presentes',
        'faltas',
        'tardanzas',
        'justificadas',
        'marcasPendientes',
        'faltasPorTardanzas',
        'tardanzasRestantes',
        'justificadasPendientes',
        'justificadasRecuperadas',
        'justificadasComputables',
        'faltasConfirmadas',
        'faltasComputables',
      ].map((key) => [key, count]),
    ),
    inasistenciaPct: {
      type: 'string',
      nullable: true,
      example: '30.00',
      description:
        'Dos decimales, solo para presentación. No usar para decidir el límite.',
    },
    excedeLimite: {
      type: 'boolean',
      nullable: true,
      description:
        'Comparación exacta del numerador actual; puede ser provisional si hay J o marcas pendientes.',
    },
    condicion: {
      type: 'string',
      nullable: true,
      enum: ['DENTRO_LIMITE', 'RETIRADO_INASISTENCIA'],
      description:
        'Condición de asistencia actual, solo con datos completos y resueltos; no es un resultado final de notas.',
    },
    reglas: {
      type: 'object',
      required: [
        'parametroId',
        'version',
        'inasistenciaMaxPct',
        'tardanzasPorFalta',
      ],
      properties: {
        parametroId: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        inasistenciaMaxPct: { type: 'string', example: '30.00' },
        tardanzasPorFalta: { type: 'integer', minimum: 1, example: 3 },
      },
    },
    cierreConfirmado: {
      type: 'boolean',
      description:
        'Existe cierre específico de asistencia B15; no se infiere del estado del grupo.',
    },
    criterioSesiones: {
      type: 'string',
      enum: [
        'REALIZADAS_DEL_GRUPO_HASTA_HOY',
        'REALIZADAS_DEL_GRUPO_HASTA_EL_CIERRE',
      ],
      description:
        'Sesiones REALIZADA hasta fechaCorte en America/Lima. Tras el cierre, el corte se conserva; sin filtro mensual ni por fecha de solicitud de matrícula.',
    },
    fechaCorte: { type: 'string', format: 'date' },
  },
};
