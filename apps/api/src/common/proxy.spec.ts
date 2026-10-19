import { trustedProxyHops } from './proxy.js';

describe('Confianza explícita en el proxy inmediato B21', () => {
  it('conserva el acceso directo por defecto y admite un único intermediario', () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops('0')).toBe(0);
    expect(trustedProxyHops('1')).toBe(1);
  });
  it.each(['', '2', '-1', 'true', '1.0', 'loopback', '*'])(
    'rechaza la configuración %s',
    (value) => {
      expect(() => trustedProxyHops(value)).toThrow('TRUST_PROXY_HOPS');
    },
  );
});
