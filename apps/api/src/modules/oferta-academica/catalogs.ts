import type { Type } from '@nestjs/common';
import * as D from './offer.dto.js';

export type Catalog = {
  table: string;
  fields: Record<string, string>;
  create: Type<object>;
  update: Type<object>;
  defaults?: Record<string, unknown>;
  immutable?: string[];
  filters?: string[];
};
// Única fuente de nombres SQL. Ningún nombre de tabla o columna procede de una solicitud.
export const catalogs = {
  idiomas: {
    table: 'idiomas',
    fields: { codigo: 'codigo', nombre: 'nombre', activo: 'activo' },
    create: D.LanguageDto,
    update: D.UpdateLanguageDto,
  },
  niveles: {
    table: 'niveles',
    fields: {
      idiomaId: 'idioma_id',
      prerrequisitoId: 'prerrequisito_id',
      codigo: 'codigo',
      nombre: 'nombre',
      orden: 'orden',
      duracionMeses: 'duracion_meses',
      activo: 'activo',
    },
    create: D.LevelDto,
    update: D.UpdateLevelDto,
    immutable: ['idiomaId'],
    filters: ['idiomaId'],
  },
  unidades: {
    table: 'unidades_didacticas',
    fields: {
      nivelId: 'nivel_id',
      codigo: 'codigo',
      nombre: 'nombre',
      creditos: 'creditos',
      horasTeoricas: 'horas_teoricas',
      horasPracticas: 'horas_practicas',
      orden: 'orden',
      activo: 'activo',
    },
    create: D.UnitDto,
    update: D.UpdateUnitDto,
    immutable: ['nivelId'],
    filters: ['nivelId'],
  },
  periodos: {
    table: 'periodos_academicos',
    fields: {
      codigo: 'codigo',
      nombre: 'nombre',
      fechaInicio: 'fecha_inicio',
      fechaFin: 'fecha_fin',
      matriculaInicio: 'matricula_inicio',
      matriculaFin: 'matricula_fin',
      estado: 'estado',
    },
    create: D.PeriodDto,
    update: D.UpdatePeriodDto,
    defaults: { estado: 'PLANIFICADO' },
  },
  turnos: {
    table: 'turnos',
    fields: {
      nombre: 'nombre',
      horaInicio: 'hora_inicio',
      horaFin: 'hora_fin',
      activo: 'activo',
    },
    create: D.ShiftDto,
    update: D.UpdateShiftDto,
  },
  secciones: {
    table: 'secciones',
    fields: { codigo: 'codigo', nombre: 'nombre', activo: 'activo' },
    create: D.SectionDto,
    update: D.UpdateSectionDto,
  },
  grupos: {
    table: 'grupos',
    fields: {
      periodoId: 'periodo_id',
      nivelId: 'nivel_id',
      turnoId: 'turno_id',
      seccionId: 'seccion_id',
      codigo: 'codigo',
      capacidad: 'capacidad',
      estado: 'estado',
    },
    create: D.GroupDto,
    update: D.UpdateGroupDto,
    defaults: { estado: 'PLANIFICADO' },
    immutable: ['periodoId', 'nivelId', 'turnoId', 'seccionId'],
    filters: ['periodoId', 'nivelId', 'turnoId', 'seccionId'],
  },
} satisfies Record<string, Catalog>;
export type CatalogKey = keyof typeof catalogs;
export const readers = ['ADMIN', 'SECRETARIA', 'COORDINADOR'] as const;
