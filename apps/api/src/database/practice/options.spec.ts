import { parsePracticeOptions, validatePracticeOptions } from './options.js';

const defaults = {
  batch: 'prueba1',
  students: 120,
  groups: 6,
  teachers: 3,
  sessions: 10,
};

describe('Opciones de la carga sintética configurable', () => {
  it('aplica valores predeterminados y acepta cantidades explícitas', () => {
    expect(parsePracticeOptions([])).toEqual(defaults);
    expect(
      parsePracticeOptions([
        '--students',
        '500',
        '--groups',
        '20',
        '--teachers',
        '10',
        '--sessions',
        '10',
        '--batch',
        'prueba2',
      ]),
    ).toEqual({
      batch: 'prueba2',
      students: 500,
      groups: 20,
      teachers: 10,
      sessions: 10,
    });
  });

  it.each([
    ['--students', '0'],
    ['--students', '1'],
    ['--students', '5001'],
    ['--groups', '1'],
    ['--groups', '101'],
    ['--teachers', '0'],
    ['--teachers', '101'],
    ['--sessions', '0'],
    ['--sessions', '61'],
    ['--students', '2.5'],
    ['--students', '2e2'],
    ['--students', '+120'],
    ['--students', '0120'],
    ['--students', '-120'],
    ['--students', ' 120'],
    ['--batch', 'Prueba'],
    ['--batch', '123'],
    ['--batch', 'prueba-1'],
    ['--batch', 'pruebamas'],
    ['--batch', '../uno'],
  ])('rechaza %s=%s', (flag, value) => {
    expect(() => parsePracticeOptions([flag, value])).toThrow();
  });

  it.each([
    ['--password', 'secreto'],
    ['500'],
    ['--students'],
    ['--students', '--groups', '2'],
    ['--students', ''],
    ['--groups', '6', '--groups', '6'],
  ])(
    'rechaza opciones desconocidas, incompletas, repetidas o posicionales %j',
    (...args) => {
      expect(() => parsePracticeOptions(args)).toThrow();
    },
  );

  it('comprueba relaciones entre cantidades y limita el volumen total', () => {
    expect(() => parsePracticeOptions(['--students', '2'])).toThrow('--groups');
    expect(() => parsePracticeOptions(['--groups', '2'])).toThrow('--teachers');
    expect(() =>
      parsePracticeOptions(['--students', '5000', '--sessions', '21']),
    ).toThrow('100000');
    expect(
      parsePracticeOptions(['--students', '5000', '--sessions', '20']).students,
    ).toBe(5000);
    expect(
      parsePracticeOptions([
        '--students',
        '2',
        '--groups',
        '2',
        '--teachers',
        '1',
        '--sessions',
        '1',
        '--batch',
        'a',
      ]),
    ).toEqual({ batch: 'a', students: 2, groups: 2, teachers: 1, sessions: 1 });
  });

  it('valida llamadas directas sin conversiones de tipo implícitas', () => {
    for (const value of [undefined, null, NaN, Infinity, 1.5, '120']) {
      expect(() =>
        validatePracticeOptions({ ...defaults, students: value } as never),
      ).toThrow();
    }
    expect(() =>
      validatePracticeOptions({ ...defaults, extra: true } as never),
    ).toThrow();
    expect(() => validatePracticeOptions(null as never)).toThrow();
    expect(() => validatePracticeOptions(defaults)).not.toThrow();
  });
});
