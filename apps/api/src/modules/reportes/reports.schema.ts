import type { SchemaObject } from '@nestjs/swagger';
import { academicGroupSchema } from '../asistencia/sessions.schema.js';
import { attendanceSummarySchema } from '../asistencia/attendance-calculation.schema.js';
import { gradeSummarySchema } from '../evaluacion/grades.schema.js';
import { storedResultSchema } from '../evaluacion/act.schema.js';
import { pageSchema } from '../../common/http-schema.js';
import { reportTypes } from './report.model.js';

const text: SchemaObject = { type: 'string' };
const count: SchemaObject = { type: 'integer', minimum: 0 };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const nullableText: SchemaObject = { ...text, nullable: true };
const hash: SchemaObject = { ...text, pattern: '^[a-f0-9]{64}$' };
const tipo: SchemaObject = { ...text, enum: [...reportTypes] };
const pixels: SchemaObject = { type: 'number', minimum: 0 };
const actCellStyleSchema: SchemaObject = {
  type: 'object',
  properties: {
    color: text,
    backgroundColor: text,
    fontSize: pixels,
    fontFamily: { ...text, enum: ['Arial', 'Arial Narrow'] },
    fontWeight: { type: 'integer' },
    fontStyle: { ...text, enum: ['italic'] },
    textDecoration: { ...text, enum: ['underline'] },
    textAlign: { ...text, enum: ['left', 'center', 'right'] },
    verticalAlign: { ...text, enum: ['top', 'middle', 'bottom'] },
    rotate: { type: 'boolean' },
    borderTop: text,
    borderRight: text,
    borderBottom: text,
    borderLeft: text,
  },
};
export const reportRowSchema = object({
  matriculaId: text,
  codigo: text,
  intento: { ...count, minimum: 1 },
  estudiante: text,
  tipoDocumento: text,
  documento: text,
  notas: { type: 'object', additionalProperties: nullableText },
  notasComponentes: { type: 'object', additionalProperties: nullableText },
  resumenNotas: gradeSummarySchema,
  resumenAsistencia: attendanceSummarySchema,
  resultado: { ...storedResultSchema, nullable: true },
});
export const reportPreviewSchema = object({
  grupo: academicGroupSchema,
  tipo,
  plantilla: object({
    id: text,
    tipo,
    idioma: { ...text, enum: ['EN', 'PT'] },
    version: { type: 'integer', minimum: 1 },
    estado: { ...text, enum: ['PROPUESTA'] },
    sha256: hash,
  }),
  revision: hash,
  puedeExportar: { type: 'boolean' },
  pendientes: array(text),
  advertencias: array(text),
  resumen: object({
    matriculas: count,
    aprobados: { ...count, nullable: true },
    desaprobados: { ...count, nullable: true },
    retirados: { ...count, nullable: true },
    resultadosPendientes: count,
  }),
  indicadores: array(
    object({
      id: text,
      evaluacionId: text,
      evaluacion: text,
      codigo: text,
      descripcion: text,
      pesoEvaluacion: text,
      pesoIndicador: text,
    }),
  ),
  componentes: array(object({ id: text, nombre: text, pesoPct: text })),
  items: array(reportRowSchema),
  nextCursor: nullableText,
  anexo: object({
    idioma: text,
    nivel: text,
    creditos: nullableText,
    horas: { ...count, nullable: true },
    fechaInicio: { ...text, format: 'date' },
    fechaFin: { ...text, format: 'date' },
    matriculados: count,
    aprobados: { ...count, nullable: true },
  }),
});
reportPreviewSchema.properties!.offset = {
  ...count,
  description: 'Número de filas anteriores en el padrón ordenado del acta',
};
reportPreviewSchema.properties!.acta = {
  ...object({
    headerRows: { ...count, minimum: 1 },
    columnWidths: array(pixels),
    rows: array(
      object({
        index: { ...count, minimum: 1 },
        height: pixels,
        cells: array(
          object({
            column: { ...count, minimum: 1 },
            rowSpan: { ...count, minimum: 1 },
            colSpan: { ...count, minimum: 1 },
            text,
            style: actCellStyleSchema,
          }),
        ),
      }),
    ),
    images: array(
      object({
        src: text,
        x: pixels,
        y: pixels,
        width: pixels,
        height: pixels,
      }),
    ),
  }),
  description: 'Hoja preparada del acta, con la nómina de la página consultada',
};
export const reportHistorySchema = pageSchema(
  object({
    id: text,
    usuario_id: text,
    nombre_usuario: text,
    tipo,
    grupo_id: text,
    filtros: object({
      grupoId: text,
      periodoId: text,
      idiomaId: text,
      nivelId: text,
      tipo,
    }),
    plantilla_id: text,
    plantilla_version: { type: 'integer', minimum: 1 },
    plantilla_sha256: hash,
    revision: hash,
    archivo_nombre: text,
    archivo_sha256: hash,
    filas: { ...count, minimum: 1, maximum: 5000 },
    modo: { ...text, enum: ['BORRADOR'] },
    generado_at: { ...text, format: 'date-time' },
  }),
);
