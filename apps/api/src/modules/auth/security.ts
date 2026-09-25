import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import type { CookieOptions } from 'express';

export const COOKIE_NAME = 'excel_session';
export const SESSION_MINUTES = 15;
export const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const csrfToken = (token: string): string => digest(`csrf:${token}`);
export const newToken = (): string => randomBytes(32).toString('hex');
export const hashPassword = (password: string): Promise<string> =>
  hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export function matchesCsrf(raw: unknown, token: string): boolean {
  return (
    typeof raw === 'string' &&
    /^[a-f0-9]{64}$/.test(raw) &&
    timingSafeEqual(Buffer.from(raw), Buffer.from(csrfToken(token)))
  );
}
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1',
  };
}
export function trustedOrigins(): Set<string> {
  const values =
    process.env.WEB_ORIGINS ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3000,http://localhost:3000');
  const origins = values.split(',').filter(Boolean);
  if (!origins.length) throw new Error('Configura WEB_ORIGINS para producción');
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      !['http:', 'https:'].includes(url.protocol) ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    ) {
      throw new Error(
        'WEB_ORIGINS debe contener orígenes exactos; producción requiere HTTPS',
      );
    }
  }
  return new Set(origins);
}
