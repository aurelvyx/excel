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
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureStudent,
  type AttendanceFixtureSession,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B12 con pnpm test:db');
const password = 'Sintetica-B12-navegador';
const artifacts = fileURLToPath(new URL('../../../.tmp/b12/', import.meta.url));
const path = (s: AttendanceFixtureSession) =>
  `/asistencia/grupos/${s.grupo_id}/sesiones/${s.id}`;

describe('B12 navegador React → API → PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
  let adminId: string;
  let fixture: AttendanceFixtures;
  const previousOrigins = process.env.WEB_ORIGINS;
  const errors: string[] = [];
  const sessions = new Map<
    string,
    Awaited<ReturnType<BrowserContext['cookies']>>
  >();
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_attendance_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_attendance_web',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    fixture = await attendanceFixture(source, adminId, password);
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
    const cookies = sessions.get(name);
    if (cookies) await context.addCookies(cookies);
    await page.goto(origin);
    if (!cookies) {
      await page.getByLabel('Usuario', { exact: true }).fill(name);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      const response = page.waitForResponse(
        (res) =>
          res.url().endsWith('/api/v1/auth/login') &&
          res.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      expect((await response).status()).toBe(200);
    }
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .waitFor();
    if (!cookies) sessions.set(name, await context.cookies());
  }
  async function matrix(count = 2) {
    const group = await fixture.group();
    const session = await fixture.session(group);
    const students = [];
    const enrollments = [];
    for (let index = 0; index < count; index++) {
      const owner = await fixture.student();
      students.push(owner);
      enrollments.push(await fixture.enroll(group, owner));
    }
    return { group, session, students, enrollments };
  }
  const mark = (owner: AttendanceFixtureStudent) =>
    page.getByLabel(`Asistencia de ${owner.nombre}`, { exact: true });
  const note = (owner: AttendanceFixtureStudent) =>
    page.getByLabel(`Observación de ${owner.nombre}`, { exact: true });
  async function open(s: AttendanceFixtureSession) {
    await page.goto(`${origin}/#${path(s)}`);
    await page
      .getByRole('heading', { name: 'Registro de asistencia', exact: true })
      .waitFor();
  }
  const save = () =>
    page
      .getByRole('button', { name: 'Guardar asistencia', exact: true })
      .click();
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  }
  async function persisted(s: AttendanceFixtureSession) {
    return source.query(
      'SELECT matricula_id,codigo,observacion,version,registrado_por FROM asistencias WHERE sesion_id=$1 ORDER BY matricula_id',
      [s.id],
    );
  }
  async function externalSave(
    s: AttendanceFixtureSession,
    matriculaId: string,
    codigo: string,
    version: number | null,
  ) {
    const response = await context.request.get(`${origin}/api/v1/auth/me`);
    expect(response.status()).toBe(200);
    const auth = (await response.json()) as { csrfToken: string };
    const changed = await context.request.patch(
      `${origin}/api/v1${path(s)}/asistencias`,
      {
        headers: {
          Origin: origin,
          'X-CSRF-Token': auth.csrfToken,
          'X-Requested-With': 'Excel-Web',
        },
        data: { registros: [{ matriculaId, codigo, version }] },
      },
    );
    expect(changed.status()).toBe(200);
  }

  it('el docente registra P/F/T/J desde las sesiones y mantiene otra matrícula pendiente', async () => {
    const f = await matrix(5);
    await login('docente');
    await page.goto(`${origin}/#/asistencia/grupos/${f.group.id}`);
    await page.getByRole('link', { name: 'Asistencia', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Registro de asistencia', exact: true })
      .waitFor();
    for (const owner of f.students)
      expect(await mark(owner).inputValue()).toBe('');
    const codes = ['P', 'F', 'T', 'J'];
    for (const [index, code] of codes.entries())
      await mark(f.students[index]!).selectOption(code);
    await note(f.students[3]!).fill(
      'Justificación sintética pendiente de resolución',
    );
    expect(await persisted(f.session)).toEqual([]);
    const response = page.waitForResponse(
      (res) =>
        res.url().includes(`${path(f.session)}/asistencias`) &&
        res.request().method() === 'PATCH',
    );
    await save();
    expect((await response).status()).toBe(200);
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    const rows = await persisted(f.session);
    expect(rows.map((row: { codigo: string }) => row.codigo)).toEqual(codes);
    expect(rows).toHaveLength(4);
    expect(rows[3].observacion).toBe(
      'Justificación sintética pendiente de resolución',
    );
    expect(
      rows.every(
        (row: { registrado_por: string; version: number }) =>
          row.registrado_por === fixture.userIds.docente && row.version === 1,
      ),
    ).toBe(true);
    expect(await mark(f.students[4]!).inputValue()).toBe('');
    expect(
      (
        await source.query('SELECT estado FROM sesiones_clase WHERE id=$1', [
          f.session.id,
        ])
      )[0].estado,
    ).toBe('REALIZADA');
    const events = await source.query(
      "SELECT id FROM auditoria_eventos WHERE entidad='asistencias' AND valor_nuevo->>'sesion_id'=$1",
      [f.session.id],
    );
    expect(events).toHaveLength(4);
    await screenshot('matriz-docente');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot('matriz-movil');
  });
  it('valida una observación sin marca y permite corregir un registro abierto', async () => {
    const f = await matrix(1);
    await login('docente');
    await open(f.session);
    await note(f.students[0]!).fill('Comentario sin marca');
    await save();
    await page
      .getByText('Selecciona P, F, T o J antes de guardar.', { exact: true })
      .waitFor();
    expect(await mark(f.students[0]!).getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(await persisted(f.session)).toEqual([]);
    await mark(f.students[0]!).selectOption('P');
    await save();
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    await mark(f.students[0]!).selectOption('T');
    await note(f.students[0]!).fill('Comentario corregido');
    await save();
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    expect((await persisted(f.session))[0]).toMatchObject({
      codigo: 'T',
      observacion: 'Comentario corregido',
      version: 2,
    });
  });
  it('un conflicto conserva la captura y exige descartar explícitamente antes de recargar', async () => {
    const f = await matrix(1);
    await login('docente');
    await open(f.session);
    await mark(f.students[0]!).selectOption('F');
    await note(f.students[0]!).fill('Captura local conservada');
    await externalSave(f.session, f.enrollments[0]!.id, 'P', null);
    const response = page.waitForResponse(
      (res) =>
        res.url().includes(`${path(f.session)}/asistencias`) &&
        res.request().method() === 'PATCH',
    );
    await save();
    expect((await response).status()).toBe(409);
    await page
      .getByRole('alert')
      .filter({ hasText: 'La asistencia cambió desde tu última consulta' })
      .waitFor();
    expect(await mark(f.students[0]!).inputValue()).toBe('F');
    expect(await note(f.students[0]!).inputValue()).toBe(
      'Captura local conservada',
    );
    expect(await mark(f.students[0]!).isDisabled()).toBe(true);
    expect(
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .isDisabled(),
    ).toBe(true);
    await screenshot('conflicto-version');
    await page
      .getByRole('button', { name: 'Recargar asistencia', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await mark(f.students[0]!).inputValue()).toBe('F');
    await page
      .getByRole('button', { name: 'Recargar asistencia', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await mark(f.students[0]!).waitFor();
    expect(await mark(f.students[0]!).inputValue()).toBe('P');
    expect(await mark(f.students[0]!).isDisabled()).toBe(false);
    expect((await persisted(f.session))[0]).toMatchObject({
      codigo: 'P',
      version: 1,
    });
  });
  it('secretaría consulta marcas sin controles de edición ni guardado', async () => {
    const f = await matrix(1);
    await login('secretaria');
    await open(f.session);
    await page
      .getByRole('row')
      .filter({ hasText: f.students[0]!.documento })
      .waitFor();
    expect(await page.locator('main').textContent()).toContain('Solo lectura');
    expect(
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole('button', { name: 'Marcar presentes', exact: true })
        .count(),
    ).toBe(0);
    expect(await mark(f.students[0]!).count()).toBe(0);
    expect(await persisted(f.session)).toEqual([]);
  });
  it('un docente ajeno recibe denegación sin ver el padrón del grupo', async () => {
    const f = await matrix(1);
    await login('ajeno');
    await open(f.session);
    await page
      .getByRole('alert')
      .filter({ hasText: 'No tienes permiso para esta acción' })
      .waitFor();
    expect(await page.locator('main').textContent()).not.toContain(
      f.students[0]!.nombre,
    );
    expect(
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .count(),
    ).toBe(0);
    expect(await persisted(f.session)).toEqual([]);
  });
  it('un grupo cerrado presenta las marcas en solo lectura al docente asignado', async () => {
    const f = await matrix(1);
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      f.group.id,
    ]);
    await login('docente');
    await open(f.session);
    await page
      .getByRole('row')
      .filter({ hasText: f.students[0]!.documento })
      .waitFor();
    expect(await page.locator('main').textContent()).toContain('Solo lectura');
    expect(
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .count(),
    ).toBe(0);
    expect(await mark(f.students[0]!).count()).toBe(0);
  });
  it('marcar presentes afecta solo la página visible y la captura protege navegación y hash', async () => {
    const f = await matrix(21);
    await login('docente');
    await open(f.session);
    await mark(f.students[0]!).waitFor();
    await page
      .getByRole('button', { name: 'Marcar presentes', exact: true })
      .click();
    expect(await page.locator('main select').count()).toBe(20);
    const selected = await page
      .locator('main select')
      .evaluateAll((selects) =>
        selects.map((select) => (select as HTMLSelectElement).value),
      );
    expect(selected.every((code) => code === 'P')).toBe(true);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(page.url()).not.toContain('after=');
    expect(await mark(f.students[0]!).inputValue()).toBe('P');
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    expect(page.url()).toContain(`#${path(f.session)}`);
    expect(
      await page
        .getByRole('heading', { name: 'Registro de asistencia', exact: true })
        .isVisible(),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await save();
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    expect(await persisted(f.session)).toHaveLength(20);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await mark(f.students[20]!).waitFor();
    expect(await mark(f.students[20]!).inputValue()).toBe('');
    await page
      .getByRole('button', { name: 'Primera página', exact: true })
      .click();
    await mark(f.students[0]!).waitFor();
    await mark(f.students[0]!).selectOption('F');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await mark(f.students[20]!).waitFor();
    expect(await page.getByRole('dialog').count()).toBe(0);
    expect(await mark(f.students[20]!).inputValue()).toBe('');
    expect((await persisted(f.session))[0].codigo).toBe('P');
    await mark(f.students[20]!).selectOption('F');
    await page
      .getByRole('link', { name: '← Volver a sesiones', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Sesiones de clase', exact: true })
      .waitFor();
    expect(await persisted(f.session)).toHaveLength(20);
  });
  it('el botón Atrás conserva la captura hasta confirmar el descarte', async () => {
    const f = await matrix(1);
    await login('docente');
    await page.goto(`${origin}/#/asistencia/grupos/${f.group.id}`);
    await page.getByRole('link', { name: 'Asistencia', exact: true }).click();
    await mark(f.students[0]!).selectOption('T');
    await page.goBack();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    expect(page.url()).toContain(`#${path(f.session)}`);
    expect(await mark(f.students[0]!).inputValue()).toBe('T');
    await page
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Sesiones de clase', exact: true })
      .waitFor();
    expect(await persisted(f.session)).toEqual([]);
  });
  it('cancelar el cierre de sesión conserva la captura y la sesión del docente', async () => {
    const f = await matrix(1);
    await login('docente');
    await open(f.session);
    await mark(f.students[0]!).selectOption('P');
    await note(f.students[0]!).fill('Captura pendiente antes de salir');
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await page
        .getByRole('button', { name: 'Cerrar sesión', exact: true })
        .isVisible(),
    ).toBe(true);
    expect(await mark(f.students[0]!).inputValue()).toBe('P');
    expect(await note(f.students[0]!).inputValue()).toBe(
      'Captura pendiente antes de salir',
    );
    expect(
      (await context.request.get(`${origin}/api/v1/auth/me`)).status(),
    ).toBe(200);
    expect(await persisted(f.session)).toEqual([]);
  });
});
