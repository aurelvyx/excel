import type { SchemaObject } from '@nestjs/swagger';
import { academicGroupSchema } from '../asistencia/sessions.schema.js';
import { attendanceSummarySchema } from '../asistencia/attendance-calculation.schema.js';
import { gradeSchema, gradeSummarySchema } from './grades.schema.js';
import { groupEvaluationSchema } from './evaluation.schema.js';

const text: SchemaObject = { type: 'string' };
const number: SchemaObject = { type: 'integer', minimum: 0 };
const nullableText: SchemaObject = { ...text, nullable: true };
const date: SchemaObject = { ...text, format: 'date-time' };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const json: SchemaObject = { type: 'object', additionalProperties: true };
const condition: SchemaObject = {
  ...text,
  nullable: true,
  enum: ['APROBADO', 'DESAPROBADO', 'RETIRADO_INASISTENCIA'],
};
export const actClosureSchema = object({
  id: text,
  grupo_id: text,
  tipo: { ...text, enum: ['ACTA'] },
  estado: { ...text, enum: ['CERRADO'] },
  motivo: nullableText,
  realizado_por: text,
  realizado_nombre: text,
  realizado_at: date,
  revision: text,
  resumen: json,
});
export const storedResultSchema = object({
  id: text,
  matricula_id: text,
  promedio: nullableText,
  nota_oficial: { ...number, nullable: true, maximum: 20 },
  tardanzas_total: number,
  faltas_equivalentes: text,
  inasistencia_pct: nullableText,
  condicion: condition,
  calculado_at: date,
  confirmado_at: { ...date, nullable: true },
  cierre_id: nullableText,
  configuracion_id: nullableText,
  version: { ...number, minimum: 1 },
  calculo: { ...json, nullable: true },
});
const decisionSchema = object({
  condicion: condition,
  listo: { type: 'boolean' },
  pendientes: array(text),
});
export const actRowSchema = object({
  matricula_id: text,
  codigo_matricula: text,
  estudiante: text,
  tipo_documento: text,
  numero_documento: text,
  numero_intento: number,
  estado_matricula: text,
  resumenAsistencia: attendanceSummarySchema,
  resumenNotas: gradeSummarySchema,
  calculo: decisionSchema,
  resultado: { ...storedResultSchema, nullable: true },
});
const eventSchema = object({
  id: text,
  accion: {
    ...text,
    enum: ['CONFIRM_ACT_RESULT', 'CORRECT_ACT_GRADE', 'CORRECT_ACT_ATTENDANCE'],
  },
  usuario_id: nullableText,
  nombre_usuario: nullableText,
  ocurrido_at: date,
  motivo: nullableText,
  entidad_id: text,
  valor_anterior: { ...storedResultSchema, nullable: true },
  valor_nuevo: storedResultSchema,
});
export const actsPageSchema = object({
  grupo: academicGroupSchema,
  configuracion: groupEvaluationSchema.properties!
    .configuracion as SchemaObject,
  plan: groupEvaluationSchema.properties!.plan as SchemaObject,
  cierre: { ...actClosureSchema, nullable: true },
  revision: text,
  puedeCerrar: { type: 'boolean' },
  puedeCorregir: { type: 'boolean' },
  pendientes: array(text),
  resumen: object({
    matriculas: number,
    listos: number,
    aprobados: number,
    desaprobados: number,
    retirados: number,
    pendientes: number,
  }),
  items: array(actRowSchema),
  nextCursor: nullableText,
  historial: array(eventSchema),
});
export const actDetailSchema = object({
  grupo: academicGroupSchema,
  cierre: { ...actClosureSchema, nullable: true },
  revision: text,
  puedeCorregir: { type: 'boolean' },
  item: actRowSchema,
  calificaciones: array({
    ...gradeSchema,
    properties: {
      ...gradeSchema.properties,
      evaluacion: text,
      indicador: text,
    },
    required: [...gradeSchema.required!, 'evaluacion', 'indicador'],
  }),
  sesiones: array(
    object({
      id: text,
      fecha: { ...text, format: 'date' },
      estado: text,
      computable: { type: 'boolean' },
      asistencia: {
        ...object({
          id: text,
          codigo: { ...text, enum: ['P', 'F', 'T', 'J'] },
          observacion: nullableText,
          version: number,
        }),
        nullable: true,
      },
      justificacionId: nullableText,
      justificacionEstado: nullableText,
    }),
  ),
  historial: array(eventSchema),
});
export const closedActSchema = object({
  cierre: actClosureSchema,
  cantidadResultados: number,
});
export const correctedActSchema = object({
  cambio: { type: 'boolean' },
  resultado: storedResultSchema,
  cierre: actClosureSchema,
});
