import {
  attendanceChange,
  attendanceReadOnlyReason,
  AttendanceConflict,
} from './attendance.policy.js';
const open = {
  canWrite: true,
  groupState: 'ACTIVO',
  periodState: 'ABIERTO',
  sessionState: 'PROGRAMADA',
  sessionDate: '2026-10-06',
  today: '2026-10-06',
};
describe('B12 registro abierto y corrección versionada', () => {
  it('permite una sesión actual o realizada de un grupo abierto', () => {
    expect(attendanceReadOnlyReason(open)).toBeNull();
    expect(
      attendanceReadOnlyReason({
        ...open,
        sessionState: 'REALIZADA',
        sessionDate: '2026-10-05',
      }),
    ).toBeNull();
  });
  it.each([
    { canWrite: false },
    { groupState: 'CERRADO' },
    { groupState: 'PLANIFICADO' },
    { periodState: 'CERRADO' },
    { periodState: 'PLANIFICADO' },
    { sessionState: 'CANCELADA' },
    { sessionDate: '2026-10-07' },
  ])('bloquea edición en %j', (closed) => {
    expect(attendanceReadOnlyReason({ ...open, ...closed })).toBeTruthy();
  });
  it.each(['P', 'F', 'T', 'J'] as const)(
    'registra una marca explícita %s desde pendiente',
    (codigo) => {
      expect(attendanceChange(null, { codigo, version: null })).toEqual({
        codigo,
        observacion: null,
        changed: true,
      });
    },
  );
  it('conserva la observación omitida y permite borrarla explícitamente', () => {
    const before = {
      codigo: 'T' as const,
      observacion: 'Llegó tarde',
      version: 2,
    };
    expect(attendanceChange(before, { codigo: 'T', version: 2 })).toMatchObject(
      { changed: false, observacion: 'Llegó tarde' },
    );
    expect(
      attendanceChange(before, { codigo: 'P', observacion: '  ', version: 2 }),
    ).toEqual({ changed: true, codigo: 'P', observacion: null });
  });
  it('rechaza edición obsoleta incluso si coincide el código, sin aceptar reemplazo ciego', () => {
    const before = { codigo: 'P' as const, observacion: null, version: 3 };
    expect(() => attendanceChange(before, { codigo: 'P', version: 2 })).toThrow(
      AttendanceConflict,
    );
    expect(() =>
      attendanceChange(before, { codigo: 'F', version: null }),
    ).toThrow(AttendanceConflict);
    expect(() => attendanceChange(null, { codigo: 'F', version: 1 })).toThrow(
      AttendanceConflict,
    );
  });
});
