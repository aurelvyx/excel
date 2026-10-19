import { pathToFileURL } from 'node:url';
import type { DataSource } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';

const ROLE_MARKER = 'Centro Idiomas Excel B21 runtime';

export function runtimeRoleEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const name = env.APP_DB_USER;
  const password = env.APP_DB_PASSWORD;
  if (
    !name ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(name) ||
    ['postgres', 'public'].includes(name) ||
    name.startsWith('pg_')
  ) {
    throw new Error(
      'APP_DB_USER debe ser un identificador PostgreSQL propio en minúsculas',
    );
  }
  if (name === env.DB_USER)
    throw new Error('La API y el propietario deben utilizar roles distintos');
  if (
    !password ||
    password.length < 32 ||
    password.length > 256 ||
    password.includes('\0') ||
    /[\r\n]/.test(password)
  ) {
    throw new Error(
      'APP_DB_PASSWORD debe tener entre 32 y 256 caracteres sin saltos de línea',
    );
  }
  if (password === env.DB_PASSWORD)
    throw new Error('Las contraseñas de API y propietario deben ser distintas');
  return { name, password };
}

/** Operación de despliegue: no se importa desde el arranque normal de la API. */
export async function configureRuntimeRole(
  source: DataSource,
  name: string,
  password: string,
) {
  // Validar también a quien invoque la función directamente; nunca aceptar SQL como identificador.
  runtimeRoleEnvironment({ APP_DB_USER: name, APP_DB_PASSWORD: password });
  await source.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(20260924, 21)');
    const [role] = (await manager.query(
      `SELECT oid, shobj_description(oid, 'pg_authid') AS comentario
       FROM pg_roles WHERE rolname=$1`,
      [name],
    )) as { oid: number; comentario: string | null }[];
    if (role && role.comentario !== ROLE_MARKER) {
      throw new Error(
        'El rol existente no pertenece a esta configuración de despliegue',
      );
    }
    if (role) {
      const memberships = (await manager.query(
        'SELECT 1 FROM pg_auth_members WHERE member=$1 OR roleid=$1 LIMIT 1',
        [role.oid],
      )) as unknown[];
      if (memberships.length)
        throw new Error(
          'El rol de API no puede pertenecer ni delegarse a otros roles',
        );
      const ownership = (await manager.query(
        `SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
         AND refobjid=$1 AND deptype='o' LIMIT 1`,
        [role.oid],
      )) as unknown[];
      if (ownership.length)
        throw new Error('El rol de API no puede ser propietario de objetos');
      const extraSchemas = (await manager.query(
        `SELECT 1 FROM pg_namespace WHERE nspname<>'public'
         AND has_schema_privilege($1,oid,'CREATE') LIMIT 1`,
        [name],
      )) as unknown[];
      if (extraSchemas.length)
        throw new Error(
          'El rol de API no puede crear objetos en otros esquemas',
        );
    }
    // format(%I/%L) escapa identificador y contraseña dentro de PostgreSQL.
    const [statement] = (await manager.query(
      `SELECT format($1::text, $2::text, $3::text) AS sql`,
      [
        `${role ? 'ALTER' : 'CREATE'} ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        name,
        password,
      ],
    )) as { sql: string }[];
    await manager.query(statement!.sql);
    await manager.query(`COMMENT ON ROLE "${name}" IS '${ROLE_MARKER}'`);
    await manager.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await manager.query(`REVOKE ALL ON SCHEMA public FROM "${name}"`);
    await manager.query(`GRANT USAGE ON SCHEMA public TO "${name}"`);
    await manager.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${name}"`,
    );
    await manager.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "${name}"`,
    );
    await manager.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${name}"`,
    );
    await manager.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${name}"`,
    );
    await manager.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "${name}"`,
    );
    await manager.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "${name}"`,
    );
    await manager.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${name}"`,
    );
    await manager.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${name}"`,
    );
    // PUBLIC no debe permitir crear esquemas alternativos ni tablas temporales a la API.
    const [database] = (await manager.query(
      'SELECT current_database() AS nombre',
    )) as { nombre: string }[];
    const identifier = `"${database!.nombre.replaceAll('"', '""')}"`;
    await manager.query(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${identifier} FROM PUBLIC`,
    );
    await manager.query(`REVOKE ALL ON DATABASE ${identifier} FROM "${name}"`);
    await manager.query(`GRANT CONNECT ON DATABASE ${identifier} TO "${name}"`);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadEnvironment();
  const source = createDataSource();
  try {
    const role = runtimeRoleEnvironment();
    await source.initialize();
    const applied = await source.runMigrations({ transaction: 'all' });
    await configureRuntimeRole(source, role.name, role.password);
    console.log(
      `Migraciones aplicadas: ${applied.length}. Rol de API preparado sin permisos de DDL.`,
    );
  } catch {
    // TypeORM puede incorporar parámetros a un error SQL; nunca imprimir el error completo.
    console.error(
      'No se pudo preparar la base: revise credenciales propietarias, migraciones y rol de API.',
    );
    process.exitCode = 1;
  } finally {
    delete process.env.APP_DB_PASSWORD;
    if (source.isInitialized) await source.destroy();
  }
}
