import type { SchemaObject } from '@nestjs/swagger';
const id = { type: 'string' } as const;
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
    estado: {
      type: 'string',
      enum: ['PENDIENTE', 'ACTIVA', 'ANULADA', 'CERRADA'],
    },
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
