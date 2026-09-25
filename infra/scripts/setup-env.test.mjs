import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'excel-b01-'));
  for (const path of ['infra/scripts', 'apps/api', 'apps/web']) mkdirSync(join(root, path), { recursive: true });
  copyFileSync(new URL('./setup-env.mjs', import.meta.url), join(root, 'infra/scripts/setup-env.mjs'));
  copyFileSync(new URL('../.env.example', import.meta.url), join(root, 'infra/.env.example'));
  copyFileSync(new URL('../../apps/web/.env.example', import.meta.url), join(root, 'apps/web/.env.example'));
  t.after(() => {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('excel-b01-')) {
      throw new Error('Ruta de limpieza fuera del directorio temporal de pruebas');
    }
    rmSync(target, { recursive: true });
  });
  return { root, run: () => spawnSync(process.execPath, [join(root, 'infra/scripts/setup-env.mjs')], { encoding: 'utf8' }) };
}

test('setup en equipo nuevo genera entornos coherentes y es idempotente', (t) => {
  const { root, run } = fixture(t);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const infra = readFileSync(join(root, 'infra/.env'), 'utf8');
  const api = readFileSync(join(root, 'apps/api/.env'), 'utf8');
  const db = parseEnv(infra);
  assert.equal(parseEnv(api).DB_PASSWORD, db.POSTGRES_PASSWORD);
  assert.match(db.POSTGRES_PASSWORD, /^[a-f0-9]{48}$/);
  assert.ok(!first.stdout.includes(db.POSTGRES_PASSWORD));
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(root, 'infra/.env'), 'utf8'), infra);
  assert.equal(readFileSync(join(root, 'apps/api/.env'), 'utf8'), api);
});

test('setup conserva archivos existentes y respeta contraseña con espacios y #', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, 'infra/.env'), 'POSTGRES_PASSWORD="sintetico con # signo"\n');
  assert.equal(run().status, 0);
  assert.equal(parseEnv(readFileSync(join(root, 'apps/api/.env'), 'utf8')).DB_PASSWORD, 'sintetico con # signo');
  writeFileSync(join(root, 'apps/api/.env'), 'CONFIGURACION_EXISTENTE=true\n');
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(root, 'apps/api/.env'), 'utf8'), 'CONFIGURACION_EXISTENTE=true\n');
});

test('setup rechaza contraseña vacía sin sobrescribir configuración', (t) => {
  const { root, run } = fixture(t);
  const original = 'POSTGRES_PASSWORD=\n';
  writeFileSync(join(root, 'infra/.env'), original);
  assert.notEqual(run().status, 0);
  assert.equal(readFileSync(join(root, 'infra/.env'), 'utf8'), original);
});
