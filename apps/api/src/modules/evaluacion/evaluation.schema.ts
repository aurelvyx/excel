import type { SchemaObject } from '@nestjs/swagger';
import { academicGroupSchema } from '../asistencia/sessions.schema.js';

const text: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const weight: SchemaObject = {
  ...text,
  description: 'Porcentaje decimal exacto, normalizado a dos decimales',
  pattern: '^\\d+\\.\\d{2}$',
};
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
export const evaluationLevelSchema = object({
  id: text,
  nombre: text,
  idioma: text,
});
const unitSchema = object({
  id: text,
  nombre: text,
  orden: integer,
  activo: { type: 'boolean' },
});
const indicatorSchema = object({
  codigo: text,
  descripcion: text,
  pesoPct: weight,
  orden: integer,
});
const componentSchema = object({
  nombre: text,
  unidadId: { ...text, nullable: true },
  pesoPct: weight,
  orden: integer,
  indicadores: array(indicatorSchema),
});
export const evaluationPlanSchema = object({
  id: text,
  nivel_id: text,
  version: integer,
  nombre: text,
  formula: { ...text, enum: ['PONDERADA_JERARQUICA_V1'] },
  estructura: object({ evaluaciones: array(componentSchema) }),
  estado: { ...text, enum: ['BORRADOR', 'APROBADO'] },
  revision: integer,
  creado_por: text,
  creado_at: { ...text, format: 'date-time' },
  actualizado_at: { ...text, format: 'date-time', nullable: true },
  aprobado_por: { ...text, nullable: true },
  aprobado_at: { ...text, format: 'date-time', nullable: true },
  referencia_aprobacion: { ...text, nullable: true },
  creado_nombre: text,
  aprobado_nombre: { ...text, nullable: true },
});
const validationSchema = object({
  completa: { type: 'boolean' },
  pesoTotalPct: weight,
  evaluaciones: integer,
  indicadores: integer,
  errores: array(text),
});
const historySchema = object({
  id: text,
  accion: text,
  usuario_id: { ...text, nullable: true },
  nombre_usuario: { ...text, nullable: true },
  ocurrido_at: { ...text, format: 'date-time' },
  motivo: { ...text, nullable: true },
  valor_anterior: {
    type: 'object',
    nullable: true,
    additionalProperties: true,
  },
  valor_nuevo: { type: 'object', additionalProperties: true },
});
export const evaluationLevelsSchema = object({
  items: array(evaluationLevelSchema),
  nextCursor: { ...text, nullable: true },
});
export const evaluationPlansSchema = object({
  nivel: evaluationLevelSchema,
  items: array(evaluationPlanSchema),
  unidades: array(unitSchema),
  puedeCrear: { type: 'boolean' },
  formulaSoportada: text,
});
export const evaluationPlanViewSchema = object({
  plan: evaluationPlanSchema,
  nivel: evaluationLevelSchema,
  unidades: array(unitSchema),
  puedeEditar: { type: 'boolean' },
  puedeAprobar: { type: 'boolean' },
  motivoSoloLectura: { ...text, nullable: true },
  validacion: validationSchema,
  historial: array(historySchema),
});
export const gradeReadinessSchema = object({
  criteriosAprobados: { type: 'boolean' },
  matriculasRevisables: integer,
  indicadores: integer,
  calificacionesEsperadas: integer,
  calificacionesRegistradas: integer,
  calificacionesPendientes: integer,
  puedeCerrar: { type: 'boolean' },
  motivos: array(text),
});
gradeReadinessSchema.description =
  'Preparación de criterios y notas para B18; esta consulta no ejecuta ni autoriza un cierre de acta';
const configurationSchema = object({
  id: text,
  grupo_id: text,
  nivel_id: text,
  plan_id: text,
  aplicado_por: text,
  aplicado_at: { ...text, format: 'date-time' },
  aplicado_nombre: text,
});
const copiedIndicatorSchema = object({
  id: text,
  codigo: text,
  descripcion: text,
  peso_pct: weight,
  orden: integer,
});
const copiedComponentSchema = object({
  id: text,
  nombre: text,
  peso_pct: weight,
  orden: integer,
  unidad_id: { ...text, nullable: true },
  indicadores: array(copiedIndicatorSchema),
});
export const groupEvaluationSchema = object({
  grupo: academicGroupSchema,
  nivel: evaluationLevelSchema,
  unidades: array(unitSchema),
  configuracion: { ...configurationSchema, nullable: true },
  plan: { ...evaluationPlanSchema, nullable: true },
  planesDisponibles: array(evaluationPlanSchema),
  evaluaciones: array(copiedComponentSchema),
  puedeAplicar: { type: 'boolean' },
  motivoSoloLectura: { ...text, nullable: true },
  preparacionActa: gradeReadinessSchema,
});
