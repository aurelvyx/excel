import { DataSource } from 'typeorm';
import { verify } from 'argon2';
import ExcelJS from 'exceljs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { seedPractice } from '../src/database/seed-practice.js';
import type { PracticeOptions } from '../src/database/practice/options.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { ReportsService } from '../src/modules/reportes/reports.service.js';
import { ReportsRepository } from '../src/modules/reportes/reports.repository.js';
import { ReportWorkbookService } from '../src/modules/reportes/report-workbook.service.js';
import { GradeCalculationService } from '../src/modules/evaluacion/grade-calculation.service.js';
import { AttendanceCalculationService } from '../src/modules/asistencia/attendance-calculation.service.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error(
    'Ejecutar la carga de prueba mediante pnpm test:seed o pnpm test:db',
  );

const password = 'Sintetica-practica-inicial';
const options: PracticeOptions = {
  batch: 'ensayo',
  students: 44,
  groups: 2,
  teachers: 2,
  sessions: 4,
};
const observedTables = [
  'usuarios',
  'usuario_roles',
  'sesiones_usuario',
  'personas',
  'estudiantes',
  'docentes',
  'periodos_academicos',
  'idiomas',
  'niveles',
  'unidades_didacticas',
  'turnos',
  'secciones',
  'grupos',
  'grupo_docentes',
  'parametros_academicos',
  'vouchers',
  'matriculas',
  'sesiones_clase',
  'asistencias',
  'justificaciones',
  'planes_evaluacion',
  'configuraciones_evaluacion_grupo',
  'evaluaciones',
  'indicadores_evaluacion',
  'calificaciones',
  'resultados_academicos',
  'auditoria_eventos',
];

/** B02/B20: datos para ensayo manual, con las mismas restricciones de los flujos reales. */
describe('Carga configurable sobre PostgreSQL real', () => {
  let source: DataSource;
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
    DB_NAME: process.env.DB_NAME,
  };

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_seed_practice_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_seed_practice_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    await seedDemo(source);
  }, 60000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function snapshot() {
    // Nombres cerrados de la prueba, sin datos de entrada. Las huellas evitan
    // mostrar hashes de contraseña si una comprobación de conservación falla.
    return source.query(
      observedTables
        .map(
          (table) =>
            `SELECT '${table}' AS tabla, count(*)::int AS cantidad,
       md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS huella
       FROM ${table} t`,
        )
        .join(' UNION ALL '),
    );
  }

  it('requiere habilitación explícita, entorno de desarrollo y contraseña válida antes de escribir', async () => {
    const before = await snapshot();
    try {
      process.env.NODE_ENV = 'production';
      await expect(seedPractice(source, options, password)).rejects.toThrow();
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_DEMO_SEED = 'false';
      await expect(seedPractice(source, options, password)).rejects.toThrow();
      process.env.ALLOW_DEMO_SEED = 'true';
      await expect(seedPractice(source, options, 'corta')).rejects.toThrow();
      await expect(
        seedPractice(source, options, ' '.repeat(20)),
      ).rejects.toThrow();
      await expect(
        seedPractice(source, options, 'x'.repeat(129)),
      ).rejects.toThrow();
      await expect(
        seedPractice(source, { ...options, students: 0 }, password),
      ).rejects.toThrow();
    } finally {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_DEMO_SEED = 'true';
    }
    expect(await snapshot()).toEqual(before);
  });

  it('crea ambos idiomas, matrículas, marcas y notas sintéticas conservando los catálogos B02', async () => {
    const baseline = await source.query(
      'SELECT codigo,estado FROM grupos ORDER BY id',
    );
    const summary = await seedPractice(source, options, password);
    expect(summary.created).toBe(true);
    expect(summary.batch).toBe(options.batch);
    expect(summary.counts).toMatchObject({
      students: 44,
      groups: 2,
      teachers: 2,
      sessions: 8,
      enrollments: 44,
      vouchers: 44,
    });
    for (const name of ['attendance', 'grades', 'justifications'] as const)
      expect(summary.counts[name]).toBeGreaterThan(0);
    expect(
      await source.query(
        'SELECT codigo,estado FROM grupos ORDER BY id LIMIT 2',
      ),
    ).toEqual(baseline);
    expect(
      await source.query('SELECT DISTINCT codigo FROM idiomas ORDER BY codigo'),
    ).toEqual([{ codigo: 'DEMO-EN' }, { codigo: 'DEMO-PT' }]);
    expect(
      await source.query(`SELECT m.id FROM matriculas m LEFT JOIN vouchers v ON v.id=m.voucher_id
      WHERE m.estado='ACTIVA' AND (v.id IS NULL OR v.estado<>'VALIDADO' OR v.estudiante_id<>m.estudiante_id)`),
    ).toEqual([]);
    expect(
      await source.query(
        "SELECT id FROM matriculas WHERE estado='PENDIENTE' AND voucher_id IS NOT NULL",
      ),
    ).toEqual([]);
    expect(
      (await source.query("SELECT id FROM matriculas WHERE estado='PENDIENTE'"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await source.query("SELECT id FROM vouchers WHERE estado='RECHAZADO'"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      await source.query(
        `SELECT matricula_id,sesion_id FROM asistencias GROUP BY matricula_id,sesion_id HAVING count(*)>1`,
      ),
    ).toEqual([]);
    expect(
      await source.query(
        'SELECT DISTINCT codigo FROM asistencias ORDER BY codigo',
      ),
    ).toEqual([
      { codigo: 'F' },
      { codigo: 'J' },
      { codigo: 'P' },
      { codigo: 'T' },
    ]);
    expect(
      (await source.query('SELECT id FROM calificaciones WHERE nota=0')).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await source.query(`SELECT m.id FROM matriculas m
      JOIN configuraciones_evaluacion_grupo cfg ON cfg.grupo_id=m.grupo_id
      JOIN evaluaciones e ON e.configuracion_id=cfg.id
      JOIN indicadores_evaluacion i ON i.evaluacion_id=e.id
      LEFT JOIN calificaciones c ON c.indicador_id=i.id AND c.matricula_id=m.id
      WHERE m.estado='ACTIVA' AND c.id IS NULL`)
      ).length,
    ).toBeGreaterThan(0);
    expect(await source.query('SELECT * FROM resultados_academicos')).toEqual(
      [],
    );
    expect(
      await source.query(
        `SELECT id FROM calificaciones WHERE nota<0 OR nota>20`,
      ),
    ).toEqual([]);
    const [marker] = await source.query(
      `SELECT valor_nuevo FROM auditoria_eventos
      WHERE accion='SEED_PRACTICE_COMPLETE' AND entidad='demo_lotes' AND entidad_id=$1`,
      [options.batch],
    );
    expect(marker.valor_nuevo.options).toEqual(options);
    expect(marker.valor_nuevo.summary).toEqual(summary);
    expect(
      JSON.stringify(
        await source.query(
          'SELECT valor_anterior,valor_nuevo FROM auditoria_eventos',
        ),
      ),
    ).not.toContain(password);
  }, 120000);

  it('genera cuentas por rol con cambio obligatorio y revoca las sesiones técnicas', async () => {
    const rows = await source.query(
      `SELECT nombre_usuario,password_hash,activo,requiere_cambio_clave FROM usuarios
      WHERE nombre_usuario=ANY($1::varchar[]) ORDER BY nombre_usuario`,
      [
        [
          'demo_ensayo_admin',
          'demo_ensayo_secretaria',
          'demo_ensayo_coordinador',
          'demo_ensayo_docente001',
          'demo_ensayo_docente002',
        ],
      ],
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.activo).toBe(true);
      expect(row.requiere_cambio_clave).toBe(true);
      expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(await verify(row.password_hash, password)).toBe(true);
    }
    expect(
      await source.query(
        "SELECT activo FROM usuarios WHERE nombre_usuario='seed_ensayo_loader'",
      ),
    ).toEqual([{ activo: false }]);
    expect(
      await source.query(
        'SELECT id FROM sesiones_usuario WHERE revocado_at IS NULL',
      ),
    ).toEqual([]);
    const auth = new AuthService(source, new AuditService(source));
    const { token } = await auth.login('demo_ensayo_docente001', password);
    const identity = await auth.authenticate(token);
    expect(identity.roles).toEqual(['DOCENTE']);
    expect(identity.requiere_cambio_clave).toBe(true);
    await auth.logout(identity);
  });

  it('repetir un lote conserva correcciones, claves e historial y rechaza cantidades diferentes', async () => {
    const auth = new AuthService(source, new AuditService(source));
    const { token } = await auth.login('demo_ensayo_admin', password);
    const identity = await auth.authenticate(token);
    const changedPassword = 'Sintetica-practica-cambiada';
    await auth.changePassword(identity, password, changedPassword);
    await source.query(
      "UPDATE personas SET nombres='Nombre corregido durante el ensayo' WHERE id=(SELECT persona_id FROM estudiantes ORDER BY id LIMIT 1)",
    );
    const before = await snapshot();
    const summary = await seedPractice(
      source,
      options,
      'Sintetica-otra-ejecucion',
    );
    expect(summary.created).toBe(false);
    expect(await snapshot()).toEqual(before);
    await expect(
      seedPractice(source, { ...options, students: 45 }, password),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    const [account] = await source.query(
      "SELECT password_hash,requiere_cambio_clave FROM usuarios WHERE nombre_usuario='demo_ensayo_admin'",
    );
    expect(await verify(account.password_hash, changedPassword)).toBe(true);
    expect(account.requiere_cambio_clave).toBe(false);
  }, 60000);

  it('un fallo tardío revierte datos, sesiones y auditoría sin alterar otros lotes', async () => {
    const before = await snapshot();
    await source.query(`CREATE FUNCTION fallo_seed_practice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fallo sintético tardío' USING ERRCODE='23514'; END $$;
      CREATE TRIGGER fallo_seed_practice BEFORE INSERT ON calificaciones
      FOR EACH ROW EXECUTE FUNCTION fallo_seed_practice()`);
    try {
      await expect(
        seedPractice(source, { ...options, batch: 'rollback' }, password),
      ).rejects.toThrow();
    } finally {
      await source.query(
        'DROP TRIGGER fallo_seed_practice ON calificaciones; DROP FUNCTION fallo_seed_practice()',
      );
    }
    expect(await snapshot()).toEqual(before);
    expect(
      await source.query(
        `SELECT id FROM auditoria_eventos WHERE entidad='demo_lotes' AND entidad_id='rollback'`,
      ),
    ).toEqual([]);
    const recovered = await seedPractice(
      source,
      { ...options, batch: 'rollback' },
      password,
    );
    expect(recovered.created).toBe(true);
    expect(recovered.counts.students).toBe(44);
  }, 120000);

  it('dos ejecuciones concurrentes del mismo lote crean una sola carga y preservan las anteriores', async () => {
    const before = await source.query(
      'SELECT count(*)::int AS cantidad FROM estudiantes',
    );
    const concurrent = { ...options, batch: 'paralelo' };
    const summaries = await Promise.all([
      seedPractice(source, concurrent, password),
      seedPractice(source, concurrent, password),
    ]);
    expect(summaries.filter((summary) => summary.created)).toHaveLength(1);
    expect(summaries.filter((summary) => !summary.created)).toHaveLength(1);
    expect(summaries[0]!.counts).toEqual(summaries[1]!.counts);
    expect(
      await source.query('SELECT count(*)::int AS cantidad FROM estudiantes'),
    ).toEqual([{ cantidad: before[0].cantidad + 44 }]);
    expect(
      await source.query(`SELECT count(*)::int AS cantidad FROM auditoria_eventos
      WHERE accion='SEED_PRACTICE_COMPLETE' AND entidad='demo_lotes' AND entidad_id='paralelo'`),
    ).toEqual([{ cantidad: 1 }]);
  }, 120000);

  it('inicia una base limpia y permite cambiar la clave y exportar borradores reales EN/PT', async () => {
    await source.query('CREATE DATABASE excel_seed_fresh_test');
    const fresh = await new DataSource(
      databaseOptions({
        ...process.env,
        DB_NAME: 'excel_seed_fresh_test',
      }),
    ).initialize();
    try {
      await fresh.runMigrations();
      const summary = await seedPractice(
        fresh,
        {
          batch: 'limpio',
          students: 12,
          groups: 2,
          teachers: 1,
          sessions: 4,
        },
        password,
      );
      expect(summary.created).toBe(true);
      expect(
        await fresh.query(`SELECT nota_minima::text,inasistencia_max_pct::text,tardanzas_por_falta
        FROM parametros_academicos ORDER BY id`),
      ).toEqual([
        {
          nota_minima: '13.00',
          inasistencia_max_pct: '30.00',
          tardanzas_por_falta: 3,
        },
      ]);
      const audit = new AuditService(fresh);
      const auth = new AuthService(fresh, audit);
      const initial = await auth.login('demo_limpio_admin', password);
      const temporaryIdentity = await auth.authenticate(initial.token);
      expect(temporaryIdentity.requiere_cambio_clave).toBe(true);
      const changedPassword = 'Sintetica-practica-nueva';
      await auth.changePassword(temporaryIdentity, password, changedPassword);
      await expect(auth.authenticate(initial.token)).rejects.toThrow();
      const logged = await auth.login('demo_limpio_admin', changedPassword);
      const actor = await auth.authenticate(logged.token);
      expect(actor.requiere_cambio_clave).toBe(false);
      const reports = new ReportsService(
        fresh,
        new ReportsRepository(),
        new ReportWorkbookService(),
        new GradeCalculationService(),
        new AttendanceCalculationService(),
        audit,
      );
      const groups = await fresh.query(`SELECT g.id,i.codigo FROM grupos g
        JOIN niveles n ON n.id=g.nivel_id JOIN idiomas i ON i.id=n.idioma_id ORDER BY g.id`);
      expect(groups.map((group: { codigo: string }) => group.codigo)).toEqual([
        'DEMO-EN',
        'DEMO-PT',
      ]);
      for (const group of groups) {
        const preview = await reports.preview(actor, group.id, {
          tipo: 'MATRIZ_NOTAS',
        });
        expect(preview.puedeExportar).toBe(true);
        expect(preview.resumen.matriculas).toBe(6);
        const exported = await reports.export(actor, group.id, {
          tipo: 'MATRIZ_NOTAS',
          revision: preview.revision,
        });
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(Uint8Array.from(exported.buffer).buffer);
        expect(exported.filename).toContain(
          `MATRIZ_NOTAS-${group.codigo.slice(-2)}-`,
        );
        expect(book.worksheets[0]!.getCell('A2').text).toContain('BORRADOR');
      }
      expect(
        await fresh.query(
          'SELECT count(*)::int AS cantidad FROM exportaciones',
        ),
      ).toEqual([{ cantidad: 2 }]);
      expect(await fresh.query('SELECT * FROM resultados_academicos')).toEqual(
        [],
      );
      await auth.logout(actor);
    } finally {
      await fresh.destroy();
    }
  }, 120000);

  it('el comando pnpm carga 500 estudiantes y lotes de asistencia superiores a cien filas', async () => {
    await source.query('CREATE DATABASE excel_seed_cli_test');
    const cliSource = await new DataSource(
      databaseOptions({
        ...process.env,
        DB_NAME: 'excel_seed_cli_test',
      }),
    ).initialize();
    try {
      await cliSource.runMigrations();
      const root = fileURLToPath(new URL('../../../', import.meta.url));
      const manifest = JSON.parse(
        await readFile(
          new URL('../../../package.json', import.meta.url),
          'utf8',
        ),
      ) as { name: string };
      expect(manifest.name).toBe('centro-idiomas-excel');
      const pnpmPath = process.env.npm_execpath;
      if (!pnpmPath)
        throw new Error(
          'Ejecutar esta prueba mediante pnpm test:seed o pnpm test:db',
        );
      const args = [
        'db:seed:practice',
        '--batch',
        'masivo',
        '--students',
        '500',
        '--groups',
        '2',
        '--teachers',
        '2',
        '--sessions',
        '2',
      ];
      const isJavaScript = /\.(c?js|mjs)$/.test(pnpmPath);
      const { stdout, stderr } = await promisify(execFile)(
        isJavaScript ? process.execPath : pnpmPath,
        isJavaScript ? [pnpmPath, ...args] : args,
        {
          cwd: root,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            ALLOW_DEMO_SEED: 'true',
            DB_NAME: 'excel_seed_cli_test',
            DEMO_SEED_PASSWORD: password,
          },
          shell: false,
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 2000000,
          encoding: 'utf8',
        },
      );
      expect(stdout).toContain('Lote sintético creado.');
      expect(stdout).toContain('demo_masivo_admin');
      expect(stdout).toContain('"students": 500');
      expect(stdout + stderr).not.toContain(password);
      expect(stdout + stderr).not.toContain('$argon2');
      expect(
        await cliSource.query(
          'SELECT count(*)::int AS cantidad FROM estudiantes',
        ),
      ).toEqual([{ cantidad: 500 }]);
      expect(
        await cliSource.query(
          'SELECT count(*)::int AS cantidad FROM matriculas',
        ),
      ).toEqual([{ cantidad: 500 }]);
      expect(
        (
          await cliSource.query(
            `SELECT count(*)::int AS cantidad FROM asistencias`,
          )
        )[0].cantidad,
      ).toBeGreaterThan(800);
      expect(
        await cliSource.query(`SELECT sesion_id,matricula_id FROM asistencias
        GROUP BY sesion_id,matricula_id HAVING count(*)>1`),
      ).toEqual([]);
      expect(
        await cliSource.query(
          'SELECT count(*)::int AS cantidad FROM sesiones_clase',
        ),
      ).toEqual([{ cantidad: 4 }]);
    } finally {
      await cliSource.destroy();
    }
  }, 150000);
});
