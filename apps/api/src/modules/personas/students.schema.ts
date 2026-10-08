import type { SchemaObject } from '@nestjs/swagger';
import { personSchema } from './person.schema.js';
import { attendanceSummarySchema } from '../asistencia/attendance-calculation.schema.js';
const text: SchemaObject = { type: 'string' };
export const studentSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    persona_id: text,
    codigo_estudiante: text,
    fecha_registro: { type: 'string', format: 'date' },
    activo: { type: 'boolean' },
    persona: personSchema,
  },
  description:
    'Coordinación recibe identidad, sin datos de contacto, dirección ni fecha de nacimiento.',
};
export const studentListSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    codigo_estudiante: text,
    fecha_registro: { type: 'string', format: 'date' },
    activo: { type: 'boolean' },
    tipo_documento: text,
    numero_documento: text,
    nombres: text,
    apellido_paterno: text,
    apellido_materno: { ...text, nullable: true },
  },
};
export const attemptSchema: SchemaObject = {
  type: 'object',
  properties: Object.fromEntries(
    [
      'id',
      'codigo',
      'numero_intento',
      'fecha_matricula',
      'estado',
      'parametro_id',
      'grupo',
      'grupo_id',
      'nivel_id',
      'nivel',
      'idioma',
      'periodo_id',
      'periodo',
      'turno',
      'seccion',
    ].map((key) => [
      key,
      key === 'numero_intento' ? { type: 'integer' } : text,
    ]),
  ),
};
attemptSchema.properties!.resumenAsistencia = attendanceSummarySchema;
attemptSchema.properties!.resultado = {
  type: 'object',
  nullable: true,
  properties: {
    promedio: { ...text, nullable: true },
    notaOficial: { type: 'integer', nullable: true },
    tardanzas: { type: 'integer' },
    faltasEquivalentes: text,
    inasistenciaPct: { ...text, nullable: true },
    condicion: { ...text, nullable: true },
    calculadoAt: { type: 'string', format: 'date-time' },
    confirmadoAt: { type: 'string', format: 'date-time', nullable: true },
  },
};
export const attemptDetailSchema: SchemaObject = {
  ...attemptSchema,
  properties: {
    ...attemptSchema.properties,
    asistencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: text,
          fecha: { type: 'string', format: 'date' },
          estado: text,
          codigo: { ...text, nullable: true, enum: ['P', 'F', 'T', 'J'] },
          computable: {
            type: 'boolean',
            description:
              'La sesión entra en el denominador del resumen de asistencia.',
          },
        },
      },
    },
    notas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: text,
          evaluacion: text,
          codigo: text,
          descripcion: text,
          activo: { type: 'boolean' },
          nota: {
            ...text,
            nullable: true,
            description:
              'Decimal exacto; null significa pendiente, distinto de cero.',
          },
        },
      },
    },
  },
};
