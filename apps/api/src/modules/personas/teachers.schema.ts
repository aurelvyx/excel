import type { SchemaObject } from '@nestjs/swagger';
const text: SchemaObject = { type: 'string' };
const nullable: SchemaObject = { type: 'string', nullable: true };
export const teacherListSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    persona_id: text,
    codigo_docente: text,
    especialidad: nullable,
    activo: { type: 'boolean' },
    nombres: text,
    apellido_paterno: text,
    apellido_materno: nullable,
  },
};
export const teacherSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: text,
    persona_id: text,
    codigo_docente: text,
    especialidad: nullable,
    activo: { type: 'boolean' },
    persona: {
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
    },
  },
};
