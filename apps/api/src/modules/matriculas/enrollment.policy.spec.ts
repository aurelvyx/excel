import {
  enrollmentAvailability,
  enrollmentCode,
  nextAttempt,
  type Availability,
} from './enrollment.policy.js';
const available: Availability = {
  activo: true,
  estado_grupo: 'ACTIVO',
  estado_periodo: 'ABIERTO',
  fecha: '2026-09-29',
  matricula_inicio: '2026-09-29',
  matricula_fin: '2026-09-29',
  capacidad: 1,
  ocupados: 0,
};
describe('B08 disponibilidad e intentos', () => {
  it('código conserva documento y ceros iniciales con correlativo único', () => {
    expect(enrollmentCode('00123456', '42')).toBe('MAT-00123456-42');
    expect(enrollmentCode('A'.repeat(25), '9223372036854775807')).toHaveLength(
      49,
    );
  });
  it('admite extremos inclusivos y capacidad no limitada', () => {
    expect(() => enrollmentAvailability(available)).not.toThrow();
    expect(() =>
      enrollmentAvailability({ ...available, capacidad: null, ocupados: 100 }),
    ).not.toThrow();
  });
  it.each([
    { activo: false },
    { estado_grupo: 'CERRADO' },
    { estado_periodo: 'PLANIFICADO' },
    { fecha: '2026-09-28' },
    { fecha: '2026-09-30' },
    { ocupados: 1 },
  ])('bloquea oferta no disponible %j', (change) =>
    expect(() => enrollmentAvailability({ ...available, ...change })).toThrow(),
  );
  it('asigna correlativo sobre historial y evita desbordamiento', () => {
    expect(nextAttempt(0)).toBe(1);
    expect(nextAttempt(12)).toBe(13);
    expect(() => nextAttempt(32767)).toThrow();
    expect(() => nextAttempt(-1)).toThrow();
  });
});
