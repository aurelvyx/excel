import {
  AttendanceClosureConflict,
  attendanceClosureReadOnlyReason,
  attendanceClosureWarnings,
  requireAttendanceClosureConfirmation,
  validateAttendanceClosureRevision,
  type AttendanceClosureCounts,
} from './attendance-closure.policy.js';

const reviewed: AttendanceClosureCounts = {
  sesionesComputables: 10,
  sesionesProgramadas: 0,
  sesionesFuturas: 0,
  matriculasRevisables: 2,
  marcasPendientes: 0,
  justificacionesPendientes: 0,
};
const revision = 'a'.repeat(64);

describe('B15 cierre de asistencia — RF36 / CU13 / RN19 y RN28–29', () => {
  it('admite confirmar exactamente la revisión vigente', () => {
    expect(() =>
      validateAttendanceClosureRevision(revision, revision),
    ).not.toThrow();
  });

  it('rechaza una revisión válida que ya no corresponde a los datos actuales', () => {
    expect(() =>
      validateAttendanceClosureRevision(revision, 'b'.repeat(64)),
    ).toThrow(AttendanceClosureConflict);
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)])(
    'rechaza una revisión que no sea SHA-256 hexadecimal canónico: %s',
    (invalid) => {
      expect(() =>
        validateAttendanceClosureRevision(invalid, revision),
      ).toThrow(AttendanceClosureConflict);
      expect(() =>
        validateAttendanceClosureRevision(revision, invalid),
      ).toThrow(AttendanceClosureConflict);
    },
  );

  it('no advierte ni exige aceptación adicional si todos los registros fueron completados', () => {
    const warnings = attendanceClosureWarnings(reviewed);
    expect(warnings).toEqual([]);
    expect(() =>
      requireAttendanceClosureConfirmation(warnings, false),
    ).not.toThrow();
  });

  it('distingue falta de sesiones y falta de matrículas sin determinar condiciones', () => {
    const warnings = attendanceClosureWarnings({
      ...reviewed,
      sesionesComputables: 0,
      matriculasRevisables: 0,
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('No hay sesiones computables');
    expect(warnings.join(' ')).toContain('No hay matrículas');
    expect(() => requireAttendanceClosureConfirmation(warnings, false)).toThrow(
      AttendanceClosureConflict,
    );
    expect(() =>
      requireAttendanceClosureConfirmation(warnings, true),
    ).not.toThrow();
  });

  it('advierte sesiones programadas y futuras sin incorporarlas al denominador', () => {
    const counts = { ...reviewed, sesionesProgramadas: 2, sesionesFuturas: 1 };
    const warnings = attendanceClosureWarnings(counts);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('no computan');
    expect(warnings.join(' ')).toContain('fecha de corte');
    expect(counts.sesionesComputables).toBe(10);
  });

  it('advierte marcas faltantes y J no recuperadas conservando los datos revisados', () => {
    const counts = {
      ...reviewed,
      marcasPendientes: 3,
      justificacionesPendientes: 2,
    };
    const original = { ...counts };
    const warnings = attendanceClosureWarnings(counts);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('no se sustituyen por faltas');
    expect(warnings.join(' ')).toContain('computarán como faltas al cierre');
    expect(counts).toEqual(original);
    expect(() => requireAttendanceClosureConfirmation(warnings, false)).toThrow(
      AttendanceClosureConflict,
    );
    expect(() =>
      requireAttendanceClosureConfirmation(warnings, true),
    ).not.toThrow();
  });

  it('mantiene todas las advertencias cuando coinciden varias clases de pendientes', () => {
    const warnings = attendanceClosureWarnings({
      sesionesComputables: 0,
      sesionesProgramadas: 1,
      sesionesFuturas: 1,
      matriculasRevisables: 0,
      marcasPendientes: 1,
      justificacionesPendientes: 1,
    });
    expect(warnings).toHaveLength(6);
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rechaza conteos inválidos antes de advertir: %s', (invalid) => {
    for (const key of Object.keys(reviewed))
      expect(() =>
        attendanceClosureWarnings({ ...reviewed, [key]: invalid }),
      ).toThrow('enteros no negativos');
  });

  it('mantiene lectura ordinaria tras cerrar y reserva la corrección administrativa auditada', () => {
    expect(attendanceClosureReadOnlyReason(null)).toBeNull();
    expect(attendanceClosureReadOnlyReason('42')).toContain(
      'solo el administrador puede corregir con motivo y auditoría',
    );
  });
});
