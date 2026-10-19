import type { SchemaObject } from '@nestjs/swagger';
import { catalogs, type CatalogKey } from './catalogs.js';

export function catalogSchema(key: CatalogKey): SchemaObject {
  const smallIds = ['idiomas', 'turnos', 'secciones'];
  const properties: Record<string, SchemaObject> = {
    id: { type: smallIds.includes(key) ? 'integer' : 'string' },
  };
  for (const column of Object.values(catalogs[key].fields)) {
    const nullable = [
      'prerrequisito_id',
      'duracion_meses',
      'creditos',
      'hora_inicio',
      'hora_fin',
      'capacidad',
    ].includes(column);
    const numeric = [
      'idioma_id',
      'turno_id',
      'seccion_id',
      'orden',
      'duracion_meses',
      'horas_teoricas',
      'horas_practicas',
      'capacidad',
    ].includes(column);
    properties[column] = {
      type: column === 'activo' ? 'boolean' : numeric ? 'integer' : 'string',
      ...(nullable ? { nullable: true } : {}),
    };
    if (
      [
        'fecha_inicio',
        'fecha_fin',
        'matricula_inicio',
        'matricula_fin',
      ].includes(column)
    )
      properties[column]!.format = 'date';
    if (column === 'estado')
      properties[column]!.enum =
        key === 'grupos'
          ? ['PLANIFICADO', 'ACTIVO', 'CERRADO']
          : ['PLANIFICADO', 'ABIERTO', 'CERRADO'];
  }
  const required = Object.keys(properties);
  if (key === 'grupos')
    properties.contexto = {
      type: 'object',
      description:
        'Disponible en consultas; nombres del contexto del grupo autorizado',
      properties: Object.fromEntries(
        ['periodo', 'idioma', 'nivel', 'turno', 'seccion'].map((key) => [
          key,
          { type: 'string' },
        ]),
      ),
    };
  return { type: 'object', required, properties };
}
export const assignmentSchema: SchemaObject = {
  type: 'object',
  properties: {
    grupo_id: { type: 'string' },
    docente_id: { type: 'string' },
    es_titular: { type: 'boolean' },
    fecha_asignacion: { type: 'string', format: 'date' },
    activo: { type: 'boolean' },
  },
};
