import type { SchemaObject } from '@nestjs/swagger';
import { pageSchema } from '../../common/http-schema.js';
import { attendanceSummarySchema } from './attendance-calculation.schema.js';
import { academicGroupSchema } from './sessions.schema.js';
import { justificationStates } from './justification.policy.js';

const text: SchemaObject = { type: 'string' };
const nullable: SchemaObject = { ...text, nullable: true };
const timestamp: SchemaObject = { ...text, format: 'date-time' };
export const justificationSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'asistencia_id',
    'motivo',
    'fecha_presentacion',
    'estado',
    'version',
    'registrado_por',
    'registrado_at',
    'registrado_nombre',
    'resuelto_por',
    'resuelto_at',
    'resuelto_nombre',
    'observacion_resolucion',
    'recuperacion_confirmada_por',
    'recuperacion_at',
    'recuperacion_nombre',
    'observacion_recuperacion',
  ],
  properties: {
    id: text,
    asistencia_id: text,
    motivo: { ...text, maxLength: 500 },
    fecha_presentacion: { ...text, format: 'date' },
    estado: {
      ...text,
      enum: [...justificationStates],
    },
    version: { type: 'integer', minimum: 1 },
    registrado_por: text,
    registrado_at: timestamp,
    registrado_nombre: text,
    resuelto_por: nullable,
    resuelto_at: { ...timestamp, nullable: true },
    resuelto_nombre: nullable,
    observacion_resolucion: { ...nullable, maxLength: 300 },
    recuperacion_confirmada_por: nullable,
    recuperacion_at: { ...timestamp, nullable: true },
    recuperacion_nombre: nullable,
    observacion_recuperacion: { ...nullable, maxLength: 300 },
  },
};
export const justificationRowSchema: SchemaObject = {
  type: 'object',
  required: [
    'asistencia_id',
    'asistencia_version',
    'codigo',
    'sesion_id',
    'fecha_sesion',
    'estado_sesion',
    'matricula_id',
    'codigo_matricula',
    'numero_intento',
    'estado_matricula',
    'estudiante_id',
    'estudiante',
    'tipo_documento',
    'numero_documento',
    'justificacion',
    'puedeRegistrar',
    'puedeResolver',
    'puedeConfirmarRecuperacion',
    'motivoSoloLectura',
    'resumenAsistencia',
  ],
  properties: {
    asistencia_id: text,
    asistencia_version: { type: 'integer', minimum: 1 },
    codigo: { ...text, enum: ['J'] },
    sesion_id: text,
    fecha_sesion: { ...text, format: 'date' },
    estado_sesion: text,
    matricula_id: text,
    codigo_matricula: text,
    numero_intento: { type: 'integer', minimum: 1 },
    estado_matricula: text,
    estudiante_id: text,
    estudiante: text,
    tipo_documento: text,
    numero_documento: text,
    justificacion: { ...justificationSchema, nullable: true },
    puedeRegistrar: { type: 'boolean' },
    puedeResolver: { type: 'boolean' },
    puedeConfirmarRecuperacion: { type: 'boolean' },
    motivoSoloLectura: nullable,
    resumenAsistencia: attendanceSummarySchema,
  },
};
export const justificationPageSchema: SchemaObject = {
  ...pageSchema(justificationRowSchema),
  required: ['items', 'nextCursor', 'grupo', 'hoy'],
  properties: {
    ...pageSchema(justificationRowSchema).properties,
    grupo: academicGroupSchema,
    hoy: { ...text, format: 'date' },
  },
};
export const justificationDetailSchema: SchemaObject = {
  ...justificationRowSchema,
  required: [...justificationRowSchema.required!, 'historial'],
  properties: {
    ...justificationRowSchema.properties,
    historial: {
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
          'estado_anterior',
          'estado_nuevo',
        ],
        properties: {
          id: text,
          accion: text,
          usuario_id: nullable,
          nombre_usuario: nullable,
          ocurrido_at: timestamp,
          motivo: nullable,
          estado_anterior: nullable,
          estado_nuevo: text,
        },
      },
    },
  },
};
