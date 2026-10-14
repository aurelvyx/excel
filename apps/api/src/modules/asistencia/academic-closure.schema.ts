import type { SchemaObject } from '@nestjs/swagger';

const text: SchemaObject = { type: 'string' };
export const academicClosureSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'grupo_id',
    'tipo',
    'estado',
    'motivo',
    'realizado_por',
    'realizado_at',
    'realizado_nombre',
    'fecha_corte',
    'revision',
    'resumen',
  ],
  properties: {
    id: text,
    grupo_id: text,
    tipo: { ...text, enum: ['ASISTENCIA'] },
    estado: { ...text, enum: ['CERRADO'] },
    motivo: { ...text, nullable: true, maxLength: 400 },
    realizado_por: text,
    realizado_at: { ...text, format: 'date-time' },
    realizado_nombre: text,
    fecha_corte: { ...text, format: 'date' },
    revision: { ...text, pattern: '^[a-f0-9]{64}$' },
    resumen: {
      type: 'object',
      additionalProperties: true,
      description:
        'Evidencia inmutable de la revisión aceptada: conteos y resúmenes previos por intento',
    },
  },
};
