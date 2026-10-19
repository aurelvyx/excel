import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { chromium, type Browser } from 'playwright';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  writeFile,
  unlink,
  rmdir,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { Respaldos1790208016000 } from '../src/database/migraciones/1790208016000-respaldos.js';
import { attendanceFixture } from './attendance.fixture.js';
import {
  createWebServer,
  freePort,
  type ViteServer,
} from './browser-server.js';

if (
  process.env.NODE_ENV !== 'test' ||
  process.env.DB_NAME !== 'excel_test' ||
  !process.env.TEST_DOCKER_NETWORK
)
  throw new Error('Ejecutar B21 con pnpm test:b21 o pnpm test:db');
type Login = { cookie: string; csrf: string };
type SavedBackup = {
  id: string;
  archivo: string;
  sha256: string;
  bytes: number;
};
type Restore = {
  id: string;
  tablas: number;
  migraciones: number;
  intentoCompletoVerificado: boolean;
  intentoId: string;
};
type Operations = {
  backup: (
    env: NodeJS.ProcessEnv,
    dependencies?: object,
  ) => Promise<SavedBackup>;
  verifyRestore: (env: NodeJS.ProcessEnv) => Promise<Restore>;
};
const password = 'Sintetica-segura-B21';

describe('B21 respaldo real, restauración aislada y consulta administrativa', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let vite: ViteServer;
  let origin: string;
  let directory: string;
  let adminId: string;
  let admin: Login;
  let teacher: Login;
  let env: NodeJS.ProcessEnv;
  let operations: Operations;
  let saved: SavedBackup;
  let enrollmentId: string;
  const previousOrigins = process.env.WEB_ORIGINS;
  const files = new Set<string>();

  async function login(name: string): Promise<Login> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Requested-With', 'Excel-Web')
      .send({ nombreUsuario: name, password })
      .expect(200);
    return {
      cookie: (response.headers['set-cookie'] as unknown as string[])[0]!.split(
        ';',
      )[0]!,
      csrf: response.body.csrfToken,
    };
  }
  function call(method: 'get' | 'post' | 'patch', path: string, actor = admin) {
    return request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Cookie', actor.cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_backups_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_backups_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    adminId = (await bootstrapAdministrator(source, 'admin_b21', password)).id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    const fixture = await attendanceFixture(source, adminId, password);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    admin = await login('admin_b21');
    teacher = await login('docente');
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    enrollmentId = enrollment.id;
    const session = await fixture.session(group, 'REALIZADA');
    await call(
      'patch',
      `asistencia/grupos/${group.id}/sesiones/${session.id}/asistencias`,
      teacher,
    )
      .send({
        registros: [
          {
            matriculaId: enrollment.id,
            codigo: 'P',
            observacion: null,
            version: null,
          },
        ],
      })
      .expect(200);
    const plan = (
      await call('post', `evaluacion/niveles/${group.nivel_id}/planes`)
        .send({
          nombre: 'Plan sintético de recuperación B21',
          formula: 'PONDERADA_JERARQUICA_V1',
          estructura: {
            evaluaciones: [
              {
                nombre: 'Evaluación sintética',
                unidadId: null,
                pesoPct: '100',
                orden: 1,
                indicadores: [
                  {
                    codigo: 'SYN-B21',
                    descripcion: 'Criterio sintético de restauración',
                    pesoPct: '100',
                    orden: 1,
                  },
                ],
              },
            ],
          },
        })
        .expect(201)
    ).body.plan;
    await call('post', `evaluacion/planes/${plan.id}/aprobacion`)
      .send({
        revision: plan.revision,
        referenciaAprobacion:
          'Configuración sintética, sin aprobación institucional',
        confirmado: true,
      })
      .expect(201);
    const config = (
      await call('post', `evaluacion/grupos/${group.id}/configuracion`)
        .send({ planId: plan.id, confirmado: true })
        .expect(201)
    ).body;
    await call('patch', `evaluacion/grupos/${group.id}/calificaciones`, teacher)
      .send({
        registros: [
          {
            matriculaId: enrollment.id,
            indicadorId: config.evaluaciones[0].indicadores[0].id,
            nota: '12.50',
            version: null,
          },
        ],
      })
      .expect(200);
    const attendance = (
      await call('get', `asistencia/grupos/${group.id}/cierre`).expect(200)
    ).body;
    await call('post', `asistencia/grupos/${group.id}/cierre`)
      .send({
        revision: attendance.revision,
        confirmarPendientes: true,
        motivo: 'Cierre sintético B21',
      })
      .expect(201);
    const act = (
      await call('get', `evaluacion/grupos/${group.id}/acta`).expect(200)
    ).body;
    await call('post', `evaluacion/grupos/${group.id}/acta`)
      .send({ revision: act.revision, motivo: 'Acta sintética B21' })
      .expect(201);
    directory = await mkdtemp(join(tmpdir(), 'excel-b21-'));
    env = {
      ...process.env,
      BACKUP_DIR: directory,
      BACKUP_SERVICE_ID: 'b21-prueba',
      BACKUP_ADMIN_ID: undefined,
      BACKUP_DOCKER_NETWORK: process.env.TEST_DOCKER_NETWORK,
      BACKUP_DOCKER_DB_HOST: 'postgres',
      BACKUP_DOCKER_DB_PORT: '5432',
    };
    operations = (await import(
      new URL('../../../infra/scripts/respaldo/operations.mjs', import.meta.url)
        .href
    )) as Operations;
    vite = await createWebServer(await app.getUrl(), port);
    browser = await chromium.launch();
  }, 90000);
  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    for (const file of files) await unlink(file).catch(() => {});
    if (directory) await rmdir(directory).catch(() => {});
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });

  it('pg_dump real conserva SHA256 y restaura un intento completo en un contenedor nuevo sin modificar el origen', async () => {
    const before = await source.query(
      'SELECT * FROM resultados_academicos WHERE matricula_id=$1',
      [enrollmentId],
    );
    saved = await operations.backup(env);
    files.add(join(directory, saved.archivo));
    files.add(join(directory, `${saved.archivo}.json`));
    expect(saved.bytes).toBeGreaterThan(0);
    const originalDump = await readFile(join(directory, saved.archivo));
    expect(originalDump.subarray(0, 5).toString()).toBe('PGDMP');
    const manifest = JSON.parse(
      await readFile(join(directory, `${saved.archivo}.json`), 'utf8'),
    );
    expect(manifest.evidencia.attempt).toMatchObject({ id: enrollmentId });
    expect(JSON.stringify(manifest)).not.toContain(password);
    expect(JSON.stringify(manifest)).not.toContain('password_hash');
    await expect(
      operations.verifyRestore({ ...env, BACKUP_FILE: saved.archivo }),
    ).rejects.toThrow(/RESTORE_CONFIRM/);
    const verified = await operations.verifyRestore({
      ...env,
      BACKUP_FILE: saved.archivo,
      RESTORE_CONFIRM: 'VERIFICAR_EN_CONTENEDOR_NUEVO',
    });
    expect(verified).toMatchObject({
      tablas: 32,
      migraciones: 17,
      intentoCompletoVerificado: true,
      intentoId: enrollmentId,
    });
    expect(
      await source.query(
        'SELECT * FROM resultados_academicos WHERE matricula_id=$1',
        [enrollmentId],
      ),
    ).toEqual(before);
    expect(
      await source.query(
        'SELECT tipo,estado,verificacion_completa FROM respaldos ORDER BY id',
      ),
    ).toEqual([
      { tipo: 'RESPALDO', estado: 'INICIADO', verificacion_completa: false },
      { tipo: 'RESPALDO', estado: 'EXITOSO', verificacion_completa: false },
      {
        tipo: 'RESTAURACION',
        estado: 'INICIADO',
        verificacion_completa: false,
      },
      { tipo: 'RESTAURACION', estado: 'EXITOSO', verificacion_completa: true },
    ]);
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE entidad='respaldos'",
      ),
    ).toHaveLength(4);
    const page = (await call('get', 'control/respaldos').expect(200)).body;
    expect(page.items).toHaveLength(2);
    expect(page.ultimoRespaldo.id).toBe(saved.id);
    expect(page.ultimaVerificacion.id).toBe(verified.id);
    expect(JSON.stringify(page)).not.toContain(directory);
    expect(JSON.stringify(page)).not.toContain(process.env.DB_PASSWORD!);
  }, 120000);

  it('rechaza archivo alterado antes de crear un entorno de restauración', async () => {
    const path = join(directory, saved.archivo);
    const bytes = await readFile(path);
    await writeFile(path, Buffer.concat([bytes, Buffer.from('alterado')]));
    try {
      await expect(
        operations.verifyRestore({
          ...env,
          BACKUP_FILE: saved.archivo,
          RESTORE_CONFIRM: 'VERIFICAR_EN_CONTENEDOR_NUEVO',
        }),
      ).rejects.toThrow(/SHA256/);
    } finally {
      await writeFile(path, bytes);
    }
    expect(await source.query('SELECT id FROM respaldos')).toHaveLength(4);
  });

  it('registra inicio y fallo de herramienta sin certificar un archivo ni perder auditoría', async () => {
    await expect(
      operations.backup(env, {
        command: async () => {
          throw new Error('fallo técnico sintético');
        },
      }),
    ).rejects.toThrow();
    const latest = (
      await call('get', 'control/respaldos?estado=FALLIDO').expect(200)
    ).body;
    expect(latest.items).toHaveLength(1);
    expect(latest.items[0]).toMatchObject({
      estado: 'FALLIDO',
      checksum: null,
      verificacion_completa: false,
    });
    expect(latest.ultimoRespaldo.id).toBe(saved.id);
  });

  it('autentica administrador de consola y deniega credencial equivocada sin crear operaciones', async () => {
    const previous = await source.query('SELECT id FROM respaldos');
    await expect(
      operations.backup({
        ...env,
        BACKUP_SERVICE_ID: undefined,
        BACKUP_ADMIN_ID: adminId,
        BACKUP_ADMIN_PASSWORD: 'Credencial-sintetica-incorrecta',
      }),
    ).rejects.toThrow(/administrador/);
    expect(await source.query('SELECT id FROM respaldos')).toEqual(previous);
  });

  it('conserva evidencia frente a UPDATE DELETE TRUNCATE, resultado sin inicio y reversión', async () => {
    for (const sql of [
      'UPDATE respaldos SET detalle=detalle',
      'DELETE FROM respaldos',
      'TRUNCATE respaldos',
    ])
      await expect(source.query(sql)).rejects.toMatchObject({
        driverError: { code: '23001' },
      });
    await expect(
      source.query(
        `INSERT INTO respaldos(operacion_id,tipo,estado,ubicacion_logica,detalle,proceso_tecnico,finalizado_at)
      VALUES($1,'RESPALDO','FALLIDO','sintetico.dump','Fallo sintético','b21-prueba',now())`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const runner = source.createQueryRunner();
    await runner.connect();
    try {
      await expect(new Respaldos1790208016000().down(runner)).rejects.toThrow(
        /evidencia/,
      );
    } finally {
      await runner.release();
    }
    expect(await source.query('SELECT id FROM respaldos')).toHaveLength(6);
  });

  it('limita consulta a administrador, rechaza filtros extra y pagina operaciones completas', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/control/respaldos')
      .expect(401);
    for (const name of ['docente', 'secretaria', 'coordinador'])
      await call(
        'get',
        'control/respaldos',
        name === 'docente' ? teacher : await login(name),
      ).expect(403);
    for (const query of [
      'tipo=OTRO',
      'estado=OTRO',
      'path=privado',
      'after=-1',
    ])
      await call('get', `control/respaldos?${query}`).expect(400);
    const first = (await call('get', 'control/respaldos?limit=1').expect(200))
      .body;
    const second = (
      await call(
        'get',
        `control/respaldos?limit=1&after=${first.nextCursor}`,
      ).expect(200)
    ).body;
    expect(first.items[0].operacion_id).not.toBe(second.items[0].operacion_id);
    await call('post', 'control/respaldos').send({}).expect(404);
  });

  it('la pantalla administrativa muestra comprobación real, filtros y reintento sin exponer archivos', async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel('Usuario', { exact: true }).fill('admin_b21');
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await page.getByRole('link', { name: 'Respaldos', exact: true }).click();
      await page
        .getByRole('table', { name: 'Operaciones de respaldo', exact: true })
        .waitFor();
      await expect
        .poll(() => page.getByRole('main').textContent())
        .toContain('Intento académico completo comprobado');
      await page
        .getByLabel('Resultado', { exact: true })
        .selectOption('FALLIDO');
      await expect
        .poll(() => page.getByRole('table').getByRole('row').count())
        .toBe(2);
      const route = '**/api/v1/control/respaldos?*';
      await page.route(route, (intercept) =>
        intercept.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        }),
      );
      await page
        .getByRole('button', { name: 'Actualizar respaldos', exact: true })
        .click();
      await page.getByRole('alert').waitFor();
      await page.unroute(route);
      await page
        .getByRole('button', { name: 'Reintentar', exact: true })
        .click();
      await page
        .getByRole('table', { name: 'Operaciones de respaldo', exact: true })
        .waitFor();
      await page.getByLabel('Resultado', { exact: true }).selectOption('');
      await expect
        .poll(() => page.getByRole('main').textContent())
        .toContain('Intento académico completo comprobado');
      await mkdir(new URL('../../../.tmp/b21/', import.meta.url), {
        recursive: true,
      });
      await page.screenshot({
        path: new URL(
          '../../../.tmp/b21/respaldos-administracion.png',
          import.meta.url,
        ).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }, 30000);
});
