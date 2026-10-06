import { validateSessionSchedule } from './session.policy.js';

const period = { fecha_inicio: '2026-10-01', fecha_fin: '2026-12-31' };
describe('B11 fechas reales dentro del periodo', () => {
  it('admite los extremos inclusivos y horarios opcionales', () => {
    expect(() =>
      validateSessionSchedule({ fechas: ['2026-10-01', '2026-12-31'] }, period),
    ).not.toThrow();
    expect(() =>
      validateSessionSchedule(
        { fechas: ['2026-11-01'], horaInicio: '00:00', horaFin: '23:59' },
        period,
      ),
    ).not.toThrow();
  });
  it.each(['2026-09-30', '2027-01-01'])(
    'rechaza fecha fuera del periodo %s',
    (date) => {
      expect(() => validateSessionSchedule({ fechas: [date] }, period)).toThrow(
        'dentro del periodo',
      );
    },
  );
  it.each([
    '2026-02-29',
    '2026-11-31',
    '2026-13-01',
    '2026-10-1',
    '2026-10-01T10:00:00Z',
    '0000-01-01',
  ])('rechaza fecha de calendario inválida %s', (date) => {
    expect(() => validateSessionSchedule({ fechas: [date] }, period)).toThrow(
      'inválida',
    );
  });
  it('acepta 29 de febrero solo en año bisiesto', () => {
    expect(() =>
      validateSessionSchedule(
        { fechas: ['2028-02-29'] },
        { fecha_inicio: '2028-01-01', fecha_fin: '2028-12-31' },
      ),
    ).not.toThrow();
  });
  it.each([
    { horaInicio: '09:00' },
    { horaFin: '10:00' },
    { horaInicio: '09:00', horaFin: '09:00' },
    { horaInicio: '10:00', horaFin: '09:00' },
    { horaInicio: '24:00', horaFin: '25:00' },
    { horaInicio: '09:60', horaFin: '10:00' },
  ])('rechaza horario incompleto o invertido %j', (hours) => {
    expect(() =>
      validateSessionSchedule({ fechas: ['2026-10-01'], ...hours }, period),
    ).toThrow();
  });
});
