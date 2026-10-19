import type { SchemaObject } from '@nestjs/swagger';
import { pageSchema } from '../../common/http-schema.js';
import { backupStates, backupTypes } from './backups.service.js';
const string: SchemaObject = { type: 'string' };
const nullable: SchemaObject = { ...string, nullable: true };
const timestamp: SchemaObject = { ...string, format: 'date-time' };
const properties: Record<string, SchemaObject> = {
  id: string,
  operacion_id: { ...string, format: 'uuid' },
  tipo: { ...string, enum: [...backupTypes] },
  estado: { ...string, enum: [...backupStates] },
  ubicacion_logica: string,
  checksum: nullable,
  manifest_sha256: nullable,
  tamano_bytes: nullable,
  detalle: string,
  ejecutado_por: nullable,
  proceso_tecnico: nullable,
  iniciado_at: timestamp,
  finalizado_at: { ...timestamp, nullable: true },
  respaldo_id: nullable,
  verificacion_completa: { type: 'boolean' },
  nombre_usuario: nullable,
};
export const backupRowSchema: SchemaObject = {
  type: 'object',
  properties,
  required: Object.keys(properties),
};
export const backupPageSchema: SchemaObject = {
  ...pageSchema(backupRowSchema),
  properties: {
    ...pageSchema(backupRowSchema).properties,
    ultimoRespaldo: { ...backupRowSchema, nullable: true },
    ultimaVerificacion: { ...backupRowSchema, nullable: true },
  },
  required: ['items', 'nextCursor', 'ultimoRespaldo', 'ultimaVerificacion'],
};
