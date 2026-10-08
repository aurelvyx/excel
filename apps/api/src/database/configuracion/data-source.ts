import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { databaseEnvironment, loadEnvironment } from './environment.js';
import { Identidad1790208000000 } from '../migraciones/1790208000000-identidad.js';
import { OfertaAcademica1790208001000 } from '../migraciones/1790208001000-oferta-academica.js';
import { RolesIniciales1790208002000 } from '../migraciones/1790208002000-roles-iniciales.js';
import { AccesoAuditoria1790208003000 } from '../migraciones/1790208003000-acceso-auditoria.js';
import { Historial1790208004000 } from '../migraciones/1790208004000-historial.js';
import { Vouchers1790208005000 } from '../migraciones/1790208005000-vouchers.js';
import { Matriculas1790208006000 } from '../migraciones/1790208006000-matriculas.js';
import { SolicitudReintento1790208007000 } from '../migraciones/1790208007000-solicitud-reintento.js';
import { Sesiones1790208008000 } from '../migraciones/1790208008000-sesiones.js';
import { Asistencia1790208009000 } from '../migraciones/1790208009000-asistencia.js';

export function databaseOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    ...databaseEnvironment(env),
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    migrationsTableName: 'migraciones',
    entities: [],
    migrations: [
      Identidad1790208000000,
      OfertaAcademica1790208001000,
      RolesIniciales1790208002000,
      AccesoAuditoria1790208003000,
      Historial1790208004000,
      Vouchers1790208005000,
      Matriculas1790208006000,
      SolicitudReintento1790208007000,
      Sesiones1790208008000,
      Asistencia1790208009000,
    ],
    logging: false,
  };
}

export function createDataSource(): DataSource {
  loadEnvironment();
  return new DataSource(databaseOptions());
}
