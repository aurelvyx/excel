/** Sólo se confía en el servidor web inmediato cuando el despliegue lo habilita. */
export function trustedProxyHops(value: string | undefined): number {
  if (value === undefined || value === '0') return 0;
  if (value === '1') return 1;
  throw new Error('TRUST_PROXY_HOPS sólo admite 0 o 1');
}
