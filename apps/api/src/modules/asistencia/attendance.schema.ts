import type { SchemaObject } from '@nestjs/swagger';
import { pageSchema } from '../../common/http-schema.js';
import { academicGroupSchema, sessionSchema } from './sessions.schema.js';
import { attendanceSummarySchema } from './attendance-calculation.schema.js';
import { academicClosureSchema } from './academic-closure.schema.js';
const text: SchemaObject = { type: 'string' };
export const attendanceSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'codigo',
    'observacion',
    'version',
    'registrado_por',
    'registrado_at',
    'actualizado_at',
  ],
  properties: {
    id: text,
    grupo_id: text,
    sesion_id: text,
    matricula_id: text,
    codigo: { ...text, enum: ['P', 'F', 'T', 'J'] },
    observacion: { ...text, nullable: true, maxLength: 250 },
    version: { type: 'integer', minimum: 1 },
    registrado_por: text,
    registrado_at: { ...text, format: 'date-time' },
    actualizado_at: { ...text, format: 'date-time', nullable: true },
  },
};
const rosterSchema: SchemaObject = {
  type: 'object',
  required: [
    'matricula_id',
    'codigo_matricula',
    'estudiante_id',
    'estudiante',
    'tipo_documento',
    'numero_documento',
    'numero_intento',
    'estado_matricula',
    'editable',
    'corregible',
    'asistencia',
    'resumenAsistencia',
  ],
  properties: {
    matricula_id: text,
    codigo_matricula: text,
    estudiante_id: text,
    estudiante: text,
    tipo_documento: text,
    numero_documento: text,
    numero_intento: { type: 'integer' },
    estado_matricula: { ...text, enum: ['ACTIVA', 'CERRADA', 'ANULADA'] },
    editable: { type: 'boolean' },
    corregible: { type: 'boolean' },
    asistencia: { ...attendanceSchema, nullable: true },
    resumenAsistencia: attendanceSummarySchema,
    justificacionId: { ...text, nullable: true },
    justificacionEstado: { ...text, nullable: true },
  },
};
export const attendancePageSchema: SchemaObject = {
  ...pageSchema(rosterSchema),
  required: [
    'items',
    'nextCursor',
    'grupo',
    'sesion',
    'puedeEditar',
    'puedeCorregir',
    'motivoSoloLectura',
  ],
  properties: {
    ...pageSchema(rosterSchema).properties,
    grupo: academicGroupSchema,
    sesion: sessionSchema,
    puedeEditar: { type: 'boolean' },
    puedeCorregir: { type: 'boolean' },
    motivoSoloLectura: { ...text, nullable: true },
  },
};
export const savedAttendanceSchema: SchemaObject = {
  type: 'object',
  required: ['items', 'sesion', 'resumenes'],
  properties: {
    items: { type: 'array', items: attendanceSchema },
    sesion: sessionSchema,
    resumenes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['matriculaId', 'resumenAsistencia'],
        properties: {
          matriculaId: text,
          resumenAsistencia: attendanceSummarySchema,
        },
      },
    },
  },
};
const historyValue: SchemaObject = {
  type: 'object',
  required: ['codigo', 'observacion', 'version'],
  properties: {
    codigo: { ...text, enum: ['P', 'F', 'T', 'J'] },
    observacion: { ...text, nullable: true },
    version: { type: 'integer', minimum: 1 },
  },
};
export const attendanceHistorySchema: SchemaObject = {
  type: 'object',
  required: ['asistencia', 'cierre', 'items'],
  properties: {
    asistencia: { ...attendanceSchema, nullable: true },
    cierre: { ...academicClosureSchema, nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'accion',
          'usuario_id',
          'nombre_usuario',
          'ocurrido_at',
          'motivo',
          'valor_anterior',
          'valor_nuevo',
        ],
        properties: {
          id: text,
          accion: text,
          usuario_id: { ...text, nullable: true },
          nombre_usuario: { ...text, nullable: true },
          ocurrido_at: { ...text, format: 'date-time' },
          motivo: { ...text, nullable: true },
          valor_anterior: { ...historyValue, nullable: true },
          valor_nuevo: historyValue,
        },
      },
    },
  },
};
