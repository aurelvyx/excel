import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

export function loadEnvironment(): void {
  const path = new URL('../../../.env', import.meta.url);
  if (existsSync(path)) loadEnvFile(path);
}

export function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} debe ser un entero entre 1 y 65535`);
  }
  return parsed;
}

export function databaseEnvironment(env: NodeJS.ProcessEnv = process.env) {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[name]?.trim()) throw new Error(`Falta la variable ${name}`);
  }
  if (env.DB_SSL !== undefined && !['true', 'false'].includes(env.DB_SSL)) {
    throw new Error('DB_SSL debe ser true o false');
  }
  return {
    host: env.DB_HOST!,
    port: positiveInteger(env.DB_PORT, 5432, 'DB_PORT'),
    database: env.DB_NAME!,
    username: env.DB_USER!,
    password: env.DB_PASSWORD!,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  };
}
