import { DataSource, type QueryRunner } from 'typeorm';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { rebuildDevelopmentSchema } from '../src/database/fresh.js';
import { Identidad1790208000000 } from '../src/database/migraciones/1790208000000-identidad.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar con pnpm test:db y la base aislada excel_test');

const database = 'excel_fresh_test';
const options = databaseOptions({ ...process.env, DB_NAME: database });

describe('Reconstrucción local de B02', () => {
  let base: DataSource;
  let source: DataSource;
  let systemIdentifier: string;

  beforeAll(async () => {
    base = await new DataSource(databaseOptions()).initialize();
    await base.query('CREATE DATABASE excel_fresh_test');
    source = await new DataSource(options).initialize();
    const [identity] = (await source.query(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )) as { id: string }[];
    systemIdentifier = identity!.id;
    await source.runMigrations();
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (base?.isInitialized) {
      await base.query('DROP DATABASE IF EXISTS excel_fresh_test');
      await base.destroy();
    }
  });

  it('comprueba la identidad del servidor y revierte el esquema si falla una migración', async () => {
    await source.query('CREATE TABLE prueba_fresh (nombre text)');
    await source.query("INSERT INTO prueba_fresh VALUES ('dato previo')");
    await expect(
      rebuildDevelopmentSchema(source, {
        database,
        systemIdentifier: '0',
      }),
    ).rejects.toThrow('PostgreSQL local verificado');

    class FalloFresh1790208018000 {
      async up(runner: QueryRunner) {
        await runner.query('SELECT 1 / 0');
      }
      async down() {
        /* La migración falla antes de guardar cambios. */
      }
    }
    const failing = await new DataSource({
      ...options,
      migrations: [Identidad1790208000000, FalloFresh1790208018000],
    }).initialize();
    try {
      await expect(
        rebuildDevelopmentSchema(failing, { database, systemIdentifier }),
      ).rejects.toMatchObject({ driverError: { code: '22012' } });
      expect(await source.query('SELECT nombre FROM prueba_fresh')).toEqual([
        { nombre: 'dato previo' },
      ]);
      expect(await source.showMigrations()).toBe(false);
    } finally {
      await failing.destroy();
    }
  });

  it('reaplica las migraciones, carga el lote opcional y vuelve a limpiar sin --seed', async () => {
    const target = { database, systemIdentifier };
    const seeded = await rebuildDevelopmentSchema(source, target, {
      options: {
        batch: 'fresh',
        students: 4,
        teachers: 2,
        groups: 2,
        sessions: 2,
      },
      password: 'Clave-sintetica-fresh',
    });
    expect(seeded.migrations).toBe(source.migrations.length);
    expect(seeded.summary).toMatchObject({
      created: true,
      counts: { students: 4, groups: 2 },
    });
    expect(await source.query('SELECT id FROM estudiantes')).toHaveLength(4);
    expect(await source.showMigrations()).toBe(false);

    const rebuilt = await rebuildDevelopmentSchema(source, target);
    expect(rebuilt).toEqual({
      migrations: source.migrations.length,
      summary: undefined,
    });
    expect(await source.query('SELECT id FROM estudiantes')).toEqual([]);
    expect(await source.query('SELECT id FROM roles')).toHaveLength(4);
    expect(await source.query('SELECT id FROM usuarios')).toEqual([]);
  });
});
