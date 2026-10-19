import type { SchemaObject } from '@nestjs/swagger';
const text: SchemaObject = { type: 'string' };
const nullable: SchemaObject = { type: 'string', nullable: true };
export const personSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    tipoDocumento: text,
    numeroDocumento: text,
    nombres: text,
    apellidoPaterno: text,
    apellidoMaterno: nullable,
    fechaNacimiento: { ...nullable, format: 'date' },
    telefono: nullable,
    correo: nullable,
    direccion: nullable,
    activo: { type: 'boolean' },
  },
};
