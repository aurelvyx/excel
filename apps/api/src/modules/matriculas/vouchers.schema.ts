import type { SchemaObject } from '@nestjs/swagger';
const text: SchemaObject = { type: 'string' };
const nullable: SchemaObject = { type: 'string', nullable: true };
export const voucherSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    estudiante_id: text,
    numero: text,
    fecha_pago: { ...text, format: 'date' },
    importe: { ...text, description: 'Decimal exacto con dos posiciones' },
    estado: { type: 'string', enum: ['PENDIENTE', 'VALIDADO', 'RECHAZADO'] },
    observacion: nullable,
    validado_por: nullable,
    validado_at: { ...nullable, format: 'date-time' },
    responsable: nullable,
    codigo_estudiante: text,
    estudiante: text,
    tipo_documento: text,
    numero_documento: text,
    matricula_id: nullable,
    matricula_codigo: nullable,
  },
};
