import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const root = new URL('../../', import.meta.url);
const infraPath = new URL('infra/.env', root);
if (!existsSync(infraPath)) {
  const example = readFileSync(new URL('infra/.env.example', root), 'utf8');
  writeFileSync(infraPath, example.replace('POSTGRES_PASSWORD=', `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`), { flag: 'wx' });
}
const db = parseEnv(readFileSync(infraPath, 'utf8'));
if (!db.POSTGRES_PASSWORD?.trim()) throw new Error('Define POSTGRES_PASSWORD en infra/.env antes de continuar');
const apiPath = new URL('apps/api/.env', root);
if (!existsSync(apiPath)) {
  const quote = (value) => {
    if (/["\r\n]/.test(value)) throw new Error('Configura apps/api/.env manualmente para valores con comillas o saltos de línea');
    return `"${value}"`;
  };
  writeFileSync(apiPath, [
    'NODE_ENV=development', 'PORT=3000', 'DB_HOST=127.0.0.1',
    `DB_PORT=${db.POSTGRES_PORT || '5432'}`, `DB_NAME=${quote(db.POSTGRES_DB || 'excel')}`,
    `DB_USER=${quote(db.POSTGRES_USER || 'excel')}`, `DB_PASSWORD=${quote(db.POSTGRES_PASSWORD)}`, 'DB_SSL=false', '',
  ].join('\n'), { flag: 'wx' });
}
const webPath = new URL('apps/web/.env', root);
if (!existsSync(webPath)) writeFileSync(webPath, readFileSync(new URL('apps/web/.env.example', root)), { flag: 'wx' });
console.log('Entornos disponibles. Los archivos existentes se conservaron; no se muestran credenciales.');
