import type { SchemaObject } from '@nestjs/swagger';
import { pageSchema } from '../../common/http-schema.js';
const id = { type: 'string' } as const;
const integer = { type: 'integer' } as const;
const enrollmentState: SchemaObject = {
  type: 'string',
  enum: ['PENDIENTE', 'ACTIVA', 'ANULADA', 'CERRADA'],
};
export const enrollmentSchema: SchemaObject = {
  type: 'object',
  properties: {
    id,
    clave_solicitud: { type: 'string', format: 'uuid', nullable: true },
    codigo: {
      type: 'string',
      description: 'MAT-NroDocumento-Correlativo global de matrícula',
    },
    estudiante_id: id,
    grupo_id: id,
    nivel_id: id,
    parametro_id: id,
    voucher_id: { ...id, nullable: true },
    numero_intento: { type: 'integer' },
    fecha_matricula: { type: 'string', format: 'date' },
    estado: enrollmentState,
    motivo_anulacion: { type: 'string', nullable: true },
    registrado_por: id,
    version_reglas: { type: 'integer' },
    contexto: {
      type: 'object',
      properties: {
        periodo: id,
        periodo_id: id,
        idioma: id,
        idioma_id: id,
        nivel: id,
        turno: id,
        seccion: id,
        grupo: id,
      },
    },
  },
};

const groupFields: Record<string, SchemaObject> = {
  id,
  codigo: id,
  estado: { type: 'string', enum: ['PLANIFICADO', 'ACTIVO', 'CERRADO'] },
  capacidad: { ...integer, nullable: true },
  nivel_id: id,
  idioma: id,
  nivel: id,
  turno: id,
  seccion: id,
  matriculados: integer,
};

export const enrollmentGroupsItemSchema: SchemaObject = {
  type: 'object',
  properties: {
    ...groupFields,
    hora_inicio: { ...id, nullable: true },
    hora_fin: { ...id, nullable: true },
    pendientes: integer,
  },
};

const rosterPage = pageSchema({
  type: 'object',
  properties: {
    id,
    codigo: id,
    estado: enrollmentState,
    numero_intento: integer,
    fecha_matricula: { type: 'string', format: 'date' },
    estudiante_id: id,
    codigo_estudiante: id,
    tipo_documento: id,
    numero_documento: id,
    nombres: id,
    apellido_paterno: id,
    apellido_materno: { ...id, nullable: true },
    edad: { ...integer, nullable: true },
    voucher_numero: {
      ...id,
      nullable: true,
      description: 'Visible solo para administración o secretaría',
    },
    voucher_importe: {
      ...id,
      nullable: true,
      description: 'Visible solo para administración o secretaría',
    },
  },
});

export const enrollmentRosterSchema: SchemaObject = {
  ...rosterPage,
  required: [...(rosterPage.required ?? []), 'grupo'],
  properties: {
    ...rosterPage.properties,
    grupo: {
      type: 'object',
      properties: {
        ...groupFields,
        periodo_id: id,
        periodo: id,
        periodo_estado: {
          type: 'string',
          enum: ['PLANIFICADO', 'ABIERTO', 'CERRADO'],
        },
      },
    },
  },
};
