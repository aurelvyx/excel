import {
  cookieOptions,
  csrfToken,
  digest,
  matchesCsrf,
  newToken,
  trustedOrigins,
} from './security.js';

describe('Políticas de sesión', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('los tokens aleatorios y CSRF tienen propósitos separados', () => {
    const token = newToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe(newToken());
    expect(csrfToken(token)).not.toBe(digest(token));
    expect(matchesCsrf(csrfToken(token), token)).toBe(true);
    expect(matchesCsrf('corto', token)).toBe(false);
    expect(matchesCsrf(csrfToken(newToken()), token)).toBe(false);
  });
  it('producción exige orígenes HTTPS y cookie Secure', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGINS', '');
    expect(trustedOrigins).toThrow('WEB_ORIGINS');
    vi.stubEnv('WEB_ORIGINS', 'http://localhost:3000');
    expect(trustedOrigins).toThrow('HTTPS');
    vi.stubEnv('WEB_ORIGINS', 'https://excel.example');
    expect(trustedOrigins().has('https://excel.example')).toBe(true);
    expect(cookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
    });
  });
  it('rechaza comodines y rutas en los orígenes', () => {
    vi.stubEnv('WEB_ORIGINS', '*');
    expect(trustedOrigins).toThrow();
    vi.stubEnv('WEB_ORIGINS', 'https://excel.example/ruta');
    expect(trustedOrigins).toThrow();
  });
});
