/** RN02: decimal monetario exacto (numeric(10,2)); nunca redondear una entrada. */
export function voucherAmount(value: string): string {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new Error('Importe inválido: use hasta ocho enteros y dos decimales');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n) throw new Error('El importe debe ser positivo');
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
export function voucherDecision(
  current: string,
  used: boolean,
  next: string,
  observation?: string,
): string | null {
  if (used) throw new Error('El voucher ya está vinculado a una matrícula');
  if (current !== 'PENDIENTE')
    throw new Error('El voucher ya tiene una decisión registrada');
  if (!['VALIDADO', 'RECHAZADO'].includes(next))
    throw new Error('Decisión inválida');
  const note = observation?.trim() || null;
  if (next === 'RECHAZADO' && !note)
    throw new Error('Indique el motivo del rechazo');
  return note;
}
