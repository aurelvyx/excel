import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = `excel-b02-${randomBytes(6).toString('hex')}`;
const env = { ...process.env, TEST_DB_PASSWORD: randomBytes(24).toString('hex') };
const compose = ['compose', '-p', project, '-f', 'infra/compose.test.yaml'];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}`);
  return result.stdout?.trim();
}
try {
  run('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '120']);
  const address = run('docker', [...compose, 'port', 'postgres', '5432'], { stdio: 'pipe' });
  const port = address.match(/:(\d+)$/)?.[1];
  if (!port) throw new Error('No se pudo determinar el puerto de PostgreSQL de prueba');
  Object.assign(env, { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: port, DB_NAME: 'excel_test',
    DB_USER: 'excel_test', DB_PASSWORD: env.TEST_DB_PASSWORD, DB_SSL: 'false', ALLOW_DEMO_SEED: 'true' });
  // npm_execpath lo proporciona pnpm; evita shells y rutas de ejecutables específicas del SO.
  if (!process.env.npm_execpath) throw new Error('Ejecutar mediante pnpm test:db');
  const pnpmPath = process.env.npm_execpath;
  const args = ['--filter', 'api', 'test:integration'];
  if (/\.(c?js|mjs)$/.test(pnpmPath)) {
    run(process.execPath, [pnpmPath, ...args]);
  } else {
    run(pnpmPath, args);
  }
} finally {
  run('docker', [...compose, 'down', '--remove-orphans']);
}
