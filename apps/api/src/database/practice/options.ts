export type PracticeOptions = {
  batch: string;
  students: number;
  groups: number;
  teachers: number;
  sessions: number;
};

const defaults: PracticeOptions = {
  batch: 'prueba1',
  students: 120,
  groups: 6,
  teachers: 3,
  sessions: 10,
};
const numericLimits = {
  students: [2, 5000],
  groups: [2, 100],
  teachers: [1, 100],
  sessions: [1, 60],
} as const;
const flags: Record<string, keyof PracticeOptions> = {
  '--batch': 'batch',
  '--students': 'students',
  '--groups': 'groups',
  '--teachers': 'teachers',
  '--sessions': 'sessions',
};

export function validatePracticeOptions(options: PracticeOptions): void {
  if (
    !options ||
    typeof options !== 'object' ||
    Object.keys(options).some((name) => !Object.hasOwn(defaults, name))
  )
    throw new Error('Configuración de carga sintética inválida');
  if (
    typeof options.batch !== 'string' ||
    !/^[a-z][a-z0-9]{0,7}$/.test(options.batch)
  )
    throw new Error(
      '--batch requiere de 1 a 8 letras minúsculas o números y debe comenzar por una letra',
    );
  for (const name of Object.keys(
    numericLimits,
  ) as (keyof typeof numericLimits)[]) {
    const [minimum, maximum] = numericLimits[name];
    const value = options[name];
    if (!Number.isInteger(value) || value < minimum || value > maximum)
      throw new Error(
        `--${name} requiere un entero entre ${minimum} y ${maximum}`,
      );
  }
  if (options.groups > options.students)
    throw new Error('--groups no puede superar --students');
  if (options.teachers > options.groups)
    throw new Error('--teachers no puede superar --groups');
  if (options.students * options.sessions > 100000)
    throw new Error(
      'La carga admite como máximo 100000 combinaciones de estudiante y sesión',
    );
}

export function parsePracticeOptions(args: readonly string[]): PracticeOptions {
  const raw: Record<keyof PracticeOptions, string> = {
    batch: defaults.batch,
    students: String(defaults.students),
    groups: String(defaults.groups),
    teachers: String(defaults.teachers),
    sessions: String(defaults.sessions),
  };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    if (!Object.hasOwn(flags, flag))
      throw new Error(`Opción desconocida ${flag}. Consulte --help`);
    if (seen.has(flag)) throw new Error(`Opción repetida ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`Falta el valor de ${flag}`);
    const name = flags[flag]!;
    if (name !== 'batch' && !/^[1-9][0-9]*$/.test(value))
      throw new Error(`${flag} requiere un entero positivo en formato decimal`);
    raw[name] = value;
    seen.add(flag);
  }
  const options: PracticeOptions = {
    batch: raw.batch,
    students: Number(raw.students),
    groups: Number(raw.groups),
    teachers: Number(raw.teachers),
    sessions: Number(raw.sessions),
  };
  validatePracticeOptions(options);
  return options;
}

export const practiceSeedHelp = `Carga configurable de datos sintéticos para desarrollo.

Uso
  pnpm db:seed:practice [opciones]

Opciones
  --batch      Lote de 1 a 8 caracteres minúsculos, comienza por letra. Predeterminado prueba1.
  --students   Estudiantes, entre 2 y 5000. Predeterminado 120.
  --groups     Grupos, entre 2 y 100, hasta la cantidad de estudiantes. Predeterminado 6.
  --teachers   Docentes, entre 1 y 100, hasta la cantidad de grupos. Predeterminado 3.
  --sessions   Sesiones por grupo, entre 1 y 60. Predeterminado 10.
  --help       Muestra esta ayuda.

La carga admite hasta 100000 combinaciones de estudiante y sesión.
Requiere ALLOW_DEMO_SEED=true y un entorno de desarrollo o pruebas.
Defina DEMO_SEED_PASSWORD con entre 12 y 128 caracteres mediante el entorno.
La contraseña se recibe exclusivamente por variable de entorno.
El mismo lote y configuración conserva los registros sin duplicarlos ni sobrescribirlos.
Para agregar otro conjunto utilice un --batch distinto.

Ejemplo
  pnpm db:seed:practice --students 500 --groups 20 --teachers 10 --sessions 10 --batch prueba2
`;
