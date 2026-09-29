import { voucherAmount, voucherDecision } from './voucher.policy.js';
describe('B07 políticas del voucher', () => {
  it.each([
    ['0.01', '0.01'],
    ['100', '100.00'],
    ['000001.2', '1.20'],
    ['99999999.99', '99999999.99'],
  ])('preserva importe decimal exacto %s', (input, expected) =>
    expect(voucherAmount(input)).toBe(expected),
  );
  it.each([
    '0',
    '0.00',
    '-1',
    '0.001',
    '1e2',
    '1,20',
    '100000000',
    'NaN',
    'Infinity',
    ' 1.20 ',
  ])('rechaza importe inválido %s', (value) =>
    expect(() => voucherAmount(value)).toThrow(),
  );
  it('aprueba pendiente y exige observación al rechazar', () => {
    expect(voucherDecision('PENDIENTE', false, 'VALIDADO')).toBeNull();
    expect(voucherDecision('PENDIENTE', false, 'RECHAZADO', ' Motivo ')).toBe(
      'Motivo',
    );
    expect(() => voucherDecision('PENDIENTE', false, 'RECHAZADO', ' ')).toThrow(
      'motivo',
    );
  });
  it('no redecide ni modifica comprobantes usados', () => {
    expect(() =>
      voucherDecision('VALIDADO', false, 'RECHAZADO', 'Motivo'),
    ).toThrow('decisión');
    expect(() => voucherDecision('RECHAZADO', false, 'VALIDADO')).toThrow(
      'decisión',
    );
    expect(() => voucherDecision('PENDIENTE', true, 'VALIDADO')).toThrow(
      'matrícula',
    );
  });
});
