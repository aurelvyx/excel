import type { SchemaObject } from '@nestjs/swagger';
import { academicClosureSchema } from './academic-closure.schema.js';
import { academicGroupSchema } from './sessions.schema.js';
import { attendanceSummarySchema } from './attendance-calculation.schema.js';
const text: SchemaObject = { type: 'string' };
export const attendanceClosureReviewSchema: SchemaObject = {
  type: 'object',
  required: [
    'grupo',
    'hoy',
    'cierre',
    'revision',
    'puedeCerrar',
    'motivoSoloLectura',
    'advertencias',
    'items',
    'historial',
  ],
  properties: {
    grupo: academicGroupSchema,
    hoy: { ...text, format: 'date' },
    cierre: { ...academicClosureSchema, nullable: true },
    revision: { ...text, pattern: '^[a-f0-9]{64}$' },
    puedeCerrar: { type: 'boolean' },
    motivoSoloLectura: { ...text, nullable: true },
    advertencias: {
      type: 'object',
      required: [
        'sesionesComputables',
        'sesionesProgramadas',
        'sesionesFuturas',
        'sesionesCanceladas',
        'matriculasRevisables',
        'marcasPendientes',
        'justificacionesPendientes',
      ],
      properties: Object.fromEntries(
        [
          'sesionesComputables',
          'sesionesProgramadas',
          'sesionesFuturas',
          'sesionesCanceladas',
          'matriculasRevisables',
          'marcasPendientes',
          'justificacionesPendientes',
        ].map((key) => [key, { type: 'integer', minimum: 0 }]),
      ),
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'matricula_id',
          'codigo_matricula',
          'numero_intento',
          'estado_matricula',
          'estudiante_id',
          'estudiante',
          'tipo_documento',
          'numero_documento',
          'resumenAsistencia',
        ],
        properties: {
          matricula_id: text,
          codigo_matricula: text,
          numero_intento: { type: 'integer', minimum: 1 },
          estado_matricula: text,
          estudiante_id: text,
          estudiante: text,
          tipo_documento: text,
          numero_documento: text,
          resumenAsistencia: attendanceSummarySchema,
        },
      },
    },
    historial: { type: 'array', items: academicClosureSchema },
  },
};
