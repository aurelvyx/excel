import {
  createWebServer,
  freePort,
  type ViteServer,
} from './browser-server.js';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B11 con pnpm test:db');
const password = 'Sintetica-B11-navegador';
const artifacts = fileURLToPath(new URL('../../../.tmp/b11/', import.meta.url));

describe('B11 navegador React → API → PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
  let adminId: string;
  let teacherId: string;
  let teacherUserId: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  const errors: string[] = [];
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_sessions_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_sessions_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_sessions_web',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    await seedDemo(source);
    await source.query("UPDATE periodos_academicos SET estado='ABIERTO'");
    await source.query("UPDATE grupos SET estado='ACTIVO'");
    const [teacher] = await source.query(
      "SELECT id,persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
    );
    teacherId = teacher.id;
    const encoded = await hashPassword(password);
    for (const name of ['docente', 'secretaria', 'ajeno']) {
      const [user] = await source.query(
        'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave,persona_id) VALUES($1,$2,false,$3) RETURNING id',
        [name, encoded, name === 'docente' ? teacher.persona_id : null],
      );
      if (name === 'docente') teacherUserId = user.id;
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, adminId, name === 'secretaria' ? 'SECRETARIA' : 'DOCENTE'],
      );
    }
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    vite = await createWebServer(await app.getUrl(), port);
    browser = await chromium.launch();
    await mkdir(artifacts, { recursive: true });
  }, 60000);
  beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    errors.length = 0;
    page.on('pageerror', (error) => errors.push(error.message));
  });
  afterEach(async () => {
    await context?.close();
    expect(errors).toEqual([]);
  });
  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });
  async function login(name: string) {
    await page.goto(origin);
    await page.getByLabel('Usuario', { exact: true }).fill(name);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const response = page.waitForResponse(
      (res) =>
        res.url().endsWith('/api/v1/auth/login') &&
        res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    expect((await response).status()).toBe(200);
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .waitFor();
  }
  async function group() {
    const code = `SYN-B11-WEB-${++sequence}`;
    const [row] = await source.query(
      `INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
       SELECT periodo_id,nivel_id,turno_id,seccion_id,$1,'ACTIVO' FROM grupos WHERE codigo='DEMO-EN-G1' RETURNING id`,
      [code],
    );
    await source.query(
      "INSERT INTO grupo_docentes(grupo_id,docente_id,fecha_asignacion,activo) VALUES($1,$2,'2026-09-24',true)",
      [row.id, teacherId],
    );
    return { id: row.id as string, code };
  }
  async function open(id: string) {
    await page.goto(`${origin}/#/asistencia/grupos/${id}`);
    await page
      .getByRole('heading', { name: 'Sesiones de clase', exact: true })
      .waitFor();
  }
  async function dates(values: string[]) {
    await page
      .getByRole('button', { name: 'Programar sesiones', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    for (const value of values) {
      await dialog.getByLabel('Fecha de clase', { exact: true }).fill(value);
      await dialog
        .getByRole('button', { name: 'Añadir fecha', exact: true })
        .click();
    }
    return dialog;
  }
  async function confirm() {
    await page
      .getByRole('button', { name: 'Revisar programación', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar programación', exact: true })
      .click();
  }
  async function existing(id: string, date: string) {
    await source.query(
      "INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,'PROGRAMADA',$3)",
      [id, date, adminId],
    );
  }

  it('el docente abre su grupo, confirma dos sesiones con horas y las consulta en móvil', async () => {
    const g = await group();
    await login('docente');
    await page.getByRole('link', { name: 'Mis grupos', exact: true }).click();
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: g.code, exact: true }) });
    await row.getByRole('link', { name: 'Sesiones', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Sesiones de clase', exact: true })
      .waitFor();
    const dialog = await dates(['2026-10-05', '2026-10-06']);
    await dialog.getByLabel('Hora de inicio', { exact: true }).fill('09:15');
    await dialog.getByLabel('Hora de fin', { exact: true }).fill('11:30');
    expect(
      await source.query('SELECT id FROM sesiones_clase WHERE grupo_id=$1', [
        g.id,
      ]),
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'Revisar programación', exact: true })
      .click();
    expect(
      await source.query('SELECT id FROM sesiones_clase WHERE grupo_id=$1', [
        g.id,
      ]),
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'Confirmar programación', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    await page
      .getByText('Se programaron 2 sesiones.', { exact: true })
      .waitFor();
    await page.getByRole('cell', { name: '05/10/2026', exact: true }).waitFor();
    await page.getByRole('cell', { name: '06/10/2026', exact: true }).waitFor();
    const persisted = await source.query(
      'SELECT fecha::text,hora_inicio::text,hora_fin::text,creado_por,estado FROM sesiones_clase WHERE grupo_id=$1 ORDER BY fecha',
      [g.id],
    );
    expect(persisted).toEqual([
      {
        fecha: '2026-10-05',
        hora_inicio: '09:15:00',
        hora_fin: '11:30:00',
        creado_por: teacherUserId,
        estado: 'PROGRAMADA',
      },
      {
        fecha: '2026-10-06',
        hora_inicio: '09:15:00',
        hora_fin: '11:30:00',
        creado_por: teacherUserId,
        estado: 'PROGRAMADA',
      },
    ]);
    const audits = await source.query(
      "SELECT usuario_id FROM auditoria_eventos WHERE entidad='sesiones_clase' AND valor_nuevo->>'grupo_id'=$1",
      [g.id],
    );
    expect(audits).toEqual([
      { usuario_id: teacherUserId },
      { usuario_id: teacherUserId },
    ]);
    expect(
      await source.query('SELECT id FROM asistencias WHERE grupo_id=$1', [
        g.id,
      ]),
    ).toEqual([]);
    await page.screenshot({
      path: `${artifacts}/sesiones-docente.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('cell', { name: '05/10/2026', exact: true }).waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${artifacts}/sesiones-movil.png`,
      fullPage: true,
    });
  });
  it('un conflicto de fechas muestra el error y conserva la captura sin guardar parte del lote', async () => {
    const g = await group();
    await existing(g.id, '2026-10-10');
    await login('docente');
    await open(g.id);
    await dates(['2026-10-10', '2026-10-11']);
    await confirm();
    await page
      .getByRole('alert')
      .filter({
        hasText: 'Ya existe una sesión para alguna de las fechas indicadas',
      })
      .waitFor();
    expect(await page.getByRole('dialog').isVisible()).toBe(true);
    expect(
      await source.query(
        'SELECT fecha::text FROM sesiones_clase WHERE grupo_id=$1 ORDER BY fecha',
        [g.id],
      ),
    ).toEqual([{ fecha: '2026-10-10' }]);
    await page.screenshot({
      path: `${artifacts}/conflicto-sesiones.png`,
      fullPage: true,
    });
  });
  it('secretaría consulta las fechas y el contexto sin acciones de programación', async () => {
    const g = await group();
    await existing(g.id, '2026-10-12');
    await login('secretaria');
    await open(g.id);
    await page.getByRole('cell', { name: '12/10/2026', exact: true }).waitFor();
    expect(
      await page
        .getByRole('button', { name: 'Programar sesiones', exact: true })
        .count(),
    ).toBe(0);
    expect(await page.locator('main').textContent()).toContain('Solo lectura');
    expect(await page.locator('main').textContent()).toContain(
      'Inglés de prueba',
    );
    expect(await page.locator('main').textContent()).toContain(g.code);
  });
  it('la navegación directa de un docente ajeno muestra denegación y no revela sesiones', async () => {
    const g = await group();
    await existing(g.id, '2026-10-13');
    await login('ajeno');
    await open(g.id);
    await page
      .getByRole('alert')
      .filter({ hasText: 'No tienes permiso para esta acción' })
      .waitFor();
    expect(
      await page
        .getByRole('button', { name: 'Programar sesiones', exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page.getByRole('cell', { name: '13/10/2026', exact: true }).count(),
    ).toBe(0);
    expect(await page.locator('main').textContent()).not.toContain(g.code);
  });
  it('el docente consulta un grupo cerrado sin poder añadir sesiones', async () => {
    const g = await group();
    await existing(g.id, '2026-10-14');
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      g.id,
    ]);
    await login('docente');
    await open(g.id);
    await page.getByRole('cell', { name: '14/10/2026', exact: true }).waitFor();
    expect(
      await page
        .getByRole('button', { name: 'Programar sesiones', exact: true })
        .count(),
    ).toBe(0);
    expect(await page.locator('main').textContent()).toContain('Solo lectura');
    expect(
      await source.query('SELECT id FROM sesiones_clase WHERE grupo_id=$1', [
        g.id,
      ]),
    ).toHaveLength(1);
  });
});
