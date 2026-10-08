import type { SchemaObject } from '@nestjs/swagger';
import { pageSchema } from '../../common/http-schema.js';
const text: SchemaObject = { type: 'string' };
export const sessionSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'grupo_id',
    'fecha',
    'hora_inicio',
    'hora_fin',
    'estado',
    'creado_por',
  ],
  properties: {
    id: text,
    grupo_id: text,
    fecha: { ...text, format: 'date' },
    hora_inicio: { ...text, nullable: true, example: '09:00:00' },
    hora_fin: { ...text, nullable: true, example: '11:00:00' },
    estado: { type: 'string', enum: ['PROGRAMADA', 'REALIZADA', 'CANCELADA'] },
    creado_por: text,
  },
};
export const sessionBatchSchema: SchemaObject = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: sessionSchema } },
};
export const sessionsPageSchema: SchemaObject = {
  ...pageSchema(sessionSchema),
  required: ['items', 'nextCursor', 'grupo', 'puedeProgramar'],
  properties: {
    ...pageSchema(sessionSchema).properties,
    grupo: {
      type: 'object',
      required: [
        'id',
        'codigo',
        'estado',
        'periodo_id',
        'fecha_inicio',
        'fecha_fin',
        'periodo_estado',
        'asistencia_cerrada',
        'contexto',
      ],
      properties: {
        id: text,
        codigo: text,
        estado: { ...text, enum: ['PLANIFICADO', 'ACTIVO', 'CERRADO'] },
        periodo_id: text,
        fecha_inicio: { ...text, format: 'date' },
        fecha_fin: { ...text, format: 'date' },
        periodo_estado: {
          ...text,
          enum: ['PLANIFICADO', 'ABIERTO', 'CERRADO'],
        },
        asistencia_cerrada: {
          type: 'boolean',
          description:
            'En B11 refleja el grupo cerrado; el cierre específico corresponde a B15',
        },
        contexto: {
          type: 'object',
          properties: Object.fromEntries(
            ['periodo', 'idioma', 'nivel', 'turno', 'seccion'].map((key) => [
              key,
              text,
            ]),
          ),
        },
      },
    },
    puedeProgramar: {
      type: 'boolean',
      description: 'Permisos efectivos y estado del grupo y periodo',
    },
  },
};
export const academicGroupSchema = sessionsPageSchema.properties!
  .grupo as SchemaObject;
