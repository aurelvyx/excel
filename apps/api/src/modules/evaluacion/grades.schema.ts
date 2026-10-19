import type { SchemaObject } from '@nestjs/swagger';
import { academicGroupSchema } from '../asistencia/sessions.schema.js';
import {
  evaluationPlanSchema,
  groupEvaluationSchema,
} from './evaluation.schema.js';

const text: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const date: SchemaObject = { ...text, format: 'date-time' };
export const gradeSummarySchema = object({
  configuracionAprobada: { type: 'boolean' },
  promedio: {
    ...text,
    nullable: true,
    description:
      'Promedio decimal exacto, hasta diez decimales; no se redondea antes de determinar la nota oficial',
  },
  notaOficial: { ...integer, maximum: 20, nullable: true },
  calificacionesEsperadas: integer,
  calificacionesRegistradas: integer,
  calificacionesPendientes: integer,
  motivoPendiente: { ...text, nullable: true },
});
export const gradeSchema = object({
  id: text,
  matricula_id: text,
  indicador_id: text,
  grupo_id: text,
  nota: { ...text, pattern: '^(?:0|[1-9]|1[0-9]|20)\\.[0-9]{2}$' },
  version: { ...integer, minimum: 1 },
  registrado_por: text,
  registrado_at: date,
  actualizado_at: { ...date, nullable: true },
});
const groupProperties = groupEvaluationSchema.properties!;
export const gradesPageSchema = object({
  items: array(
    object({
      matricula_id: text,
      codigo_matricula: text,
      estudiante: text,
      tipo_documento: text,
      numero_documento: text,
      numero_intento: integer,
      estado_matricula: text,
      editable: { type: 'boolean' },
      calificaciones: array(gradeSchema),
      resumenNotas: gradeSummarySchema,
    }),
  ),
  nextCursor: { ...text, nullable: true },
  grupo: academicGroupSchema,
  acta: object({
    cerrada: { type: 'boolean' },
    cierre: { type: 'object', nullable: true, additionalProperties: true },
  }),
  configuracion: groupProperties.configuracion as SchemaObject,
  plan: { ...evaluationPlanSchema, nullable: true },
  evaluaciones: groupProperties.evaluaciones as SchemaObject,
  unidades: groupProperties.unidades as SchemaObject,
  puedeEditar: { type: 'boolean' },
  motivoSoloLectura: { ...text, nullable: true },
  preparacionActa: groupProperties.preparacionActa as SchemaObject,
});
export const savedGradesSchema = object({
  items: array(gradeSchema),
  resumenes: array(
    object({ matriculaId: text, resumenNotas: gradeSummarySchema }),
  ),
  preparacionActa: groupProperties.preparacionActa as SchemaObject,
});
export const gradeHistorySchema = object({
  calificacion: { ...gradeSchema, nullable: true },
  items: array(
    object({
      id: text,
      accion: {
        ...text,
        enum: ['CREATE_GRADE', 'UPDATE_GRADE', 'CORRECT_CLOSED_GRADE'],
      },
      usuario_id: { ...text, nullable: true },
      nombre_usuario: { ...text, nullable: true },
      ocurrido_at: date,
      motivo: { ...text, nullable: true },
      valor_anterior: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },
      valor_nuevo: { type: 'object', additionalProperties: true },
    }),
  ),
});
