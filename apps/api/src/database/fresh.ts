import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MigrationExecutor, type DataSource } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import {
  databaseEnvironment,
  loadEnvironment,
} from './configuracion/environment.js';
import { transactionalSource } from './configuracion/transactional-source.js';
import {
  parsePracticeOptions,
  type PracticeOptions,
} from './practice/options.js';
import { seedPractice, validatePracticeEnvironment } from './seed-practice.js';

const help = `Reconstruye la base local de desarrollo, eliminando todos sus datos.

Uso
  pnpm db:fresh --confirm <DB_NAME>
  pnpm db:fresh --confirm <DB_NAME> --seed [opciones de db:seed:practice]

Ejecuta todas las migraciones y, con --seed, crea un lote sintético.
Use pnpm db:seed:practice --help para consultar las opciones del lote.
Para reiniciar PostgreSQL y conservar los datos, use pnpm db:restart.`;

const identitySql = `SELECT current_database() AS database,
  system_identifier::text AS "systemIdentifier" FROM pg_control_system()`;

type DatabaseTarget = { database: string; systemIdentifier: string };
type Seed = { options: PracticeOptions; password: string };

function verifyComposeTarget(confirmation: string): DatabaseTarget {
  if (process.env.NODE_ENV !== 'development')
    throw new Error('db:fresh requiere NODE_ENV=development');

  const { host, port, database, username, ssl } = databaseEnvironment();
  if (confirmation !== database)
    throw new Error('--confirm debe coincidir exactamente con DB_NAME');
  if (!['127.0.0.1', 'localhost'].includes(host) || ssl)
    throw new Error(
      'db:fresh solo se admite en el PostgreSQL local de desarrollo',
    );

  const cwd = fileURLToPath(new URL('../../../../', import.meta.url));
  const compose = [
    'compose',
    '--env-file',
    'infra/.env',
    '-f',
    'infra/compose.yaml',
  ];
  const run = (...args: string[]) =>
    execFileSync('docker', [...compose, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15_000,
      stdio: 'pipe',
      windowsHide: true,
    }).trim();

  try {
    const address = run('port', 'postgres', '5432');
    const [composeDatabase, composeUser] = run(
      'exec',
      '-T',
      'postgres',
      'printenv',
      'POSTGRES_DB',
      'POSTGRES_USER',
    ).split(/\r?\n/);
    if (
      address === `127.0.0.1:${port}` &&
      composeDatabase === database &&
      composeUser === username
    ) {
      const systemIdentifier = run(
        'exec',
        '-T',
        'postgres',
        'psql',
        '-XAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        username,
        '-d',
        database,
        '-c',
        'SELECT system_identifier::text FROM pg_control_system()',
      );
      if (/^\d+$/.test(systemIdentifier)) return { database, systemIdentifier };
    }
  } catch {
    throw new Error(
      'No se pudo verificar PostgreSQL de desarrollo. Ejecute pnpm db:up y revise la configuración local.',
    );
  }
  throw new Error(
    'La conexión de la API no coincide con el PostgreSQL local de Compose',
  );
}

export async function rebuildDevelopmentSchema(
  source: DataSource,
  target: DatabaseTarget,
  seed?: Seed,
) {
  if (seed) validatePracticeEnvironment(seed.options, seed.password);
  return source.transaction(async (manager) => {
    const [actual] = (await manager.query(identitySql)) as DatabaseTarget[];
    if (
      actual?.database !== target.database ||
      actual.systemIdentifier !== target.systemIdentifier
    )
      throw new Error(
        'La conexión no corresponde al PostgreSQL local verificado',
      );

    await manager.query("SET LOCAL lock_timeout = '10s'");
    await manager.query('SELECT pg_advisory_xact_lock(20260924,50)');
    await manager.query('DROP SCHEMA IF EXISTS public CASCADE');
    await manager.query('CREATE SCHEMA public AUTHORIZATION pg_database_owner');
    await manager.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
    await manager.query('SET LOCAL search_path TO public');
    const executor = new MigrationExecutor(source, manager.queryRunner);
    executor.transaction = 'all';
    const migrations = await executor.executePendingMigrations();
    const summary = seed
      ? await seedPractice(
          transactionalSource(source, manager),
          seed.options,
          seed.password,
        )
      : undefined;
    return { migrations: migrations.length, summary };
  });
}

async function main(args: string[]) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(help);
    return;
  }
  const [confirm, database, seedFlag, ...seedArgs] = args;
  if (confirm !== '--confirm' || !database || database.startsWith('--'))
    throw new Error(
      'Indique --confirm <DB_NAME>. Consulte pnpm db:fresh --help',
    );
  if (seedFlag !== undefined && seedFlag !== '--seed')
    throw new Error('Las opciones del lote deben ir después de --seed');

  const seed =
    seedFlag === '--seed'
      ? {
          options: parsePracticeOptions(seedArgs),
          password: process.env.DEMO_SEED_PASSWORD ?? '',
        }
      : undefined;
  if (seed) {
    delete process.env.DEMO_SEED_PASSWORD;
    validatePracticeEnvironment(seed.options, seed.password);
  }
  const target = verifyComposeTarget(database);
  const source = createDataSource();
  try {
    await source.initialize();
    const { migrations, summary } = await rebuildDevelopmentSchema(
      source,
      target,
      seed,
    );
    console.log(
      `Base de desarrollo ${database} reconstruida. Migraciones aplicadas: ${migrations}.`,
    );
    if (summary) console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    loadEnvironment();
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof Error && !('query' in error)
        ? error.message
        : 'No se pudo reconstruir la base de desarrollo. Se revirtieron los cambios de la operación.',
    );
    process.exitCode = 1;
  }
}
