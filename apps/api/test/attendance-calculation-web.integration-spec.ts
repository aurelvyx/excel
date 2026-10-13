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
  type Locator,
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
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureGroup,
  type AttendanceFixtureSession,
  type AttendanceFixtureStudent,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B13 con pnpm test:db');
const password = 'Sintetica-B13-navegador';
const artifacts = fileURLToPath(new URL('../../../.tmp/b13/', import.meta.url));
const path = (session: AttendanceFixtureSession) =>
  `/asistencia/grupos/${session.grupo_id}/sesiones/${session.id}`;
type Code = 'P' | 'F' | 'T' | 'J';
type MatrixResponse = {
  items: {
    matricula_id: string;
    resumenAsistencia: Record<string, unknown>;
  }[];
};

describe('B13 navegador React → API → PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
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
      await base.query('CREATE DATABASE excel_attendance_calculation_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_calculation_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(
      source,
      'admin_attendance_calculation_web',
      password,
    );
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    fixture = await attendanceFixture(source, admin.id, password);
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

  async function login(name = 'docente') {
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
  async function dateBefore(days: number) {
    const [row] = (await source.query(
      'SELECT ($1::date-$2::int)::text AS fecha',
      [fixture.today, days],
    )) as { fecha: string }[];
    return row!.fecha;
  }
  async function realSessions(group: AttendanceFixtureGroup, count: number) {
    const result = [];
    for (let index = count - 1; index >= 0; index--)
      result.push(
        await fixture.session(group, 'REALIZADA', await dateBefore(index)),
      );
    return result;
  }
  async function seedMark(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    code: Code,
  ) {
    await source.query(
      `INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por)
       VALUES($1,$2,$3,$4,$5)`,
      [
        session.grupo_id,
        session.id,
        enrollment.id,
        code,
        fixture.userIds.docente,
      ],
    );
  }
  async function attempt(codes: readonly (Code | null)[]) {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    const classes = await realSessions(group, codes.length);
    for (const [index, code] of codes.entries())
      if (code) await seedMark(classes[index]!, enrollment, code);
    return { group, student, enrollment, classes, session: classes.at(-1)! };
  }
  const mark = (student: AttendanceFixtureStudent) =>
    page.getByLabel(`Asistencia de ${student.nombre}`, { exact: true });
  const summary = (student: AttendanceFixtureStudent) =>
    page.getByRole('region', {
      name: `Resumen de asistencia de ${student.nombre}`,
      exact: true,
    });
  const apiSummary = (
    data: MatrixResponse,
    enrollment: AttendanceFixtureEnrollment,
  ) =>
    data.items.find((row) => row.matricula_id === enrollment.id)!
      .resumenAsistencia;
  async function contains(locator: Locator, value: string) {
    await expect
      .poll(() => locator.textContent(), { timeout: 10000 })
      .toContain(value);
  }
  async function fact(locator: Locator, label: string, value: string) {
    await expect
      .poll(
        () =>
          locator
            .getByText(label, { exact: true })
            .locator('..')
            .locator('dd')
            .textContent(),
        { timeout: 10000 },
      )
      .toBe(value);
  }
  async function breakdown(locator: Locator) {
    const details = locator.locator('details');
    if ((await details.getAttribute('open')) === null)
      await locator
        .getByText('Ver desglose de asistencia', { exact: true })
        .click();
  }
  function matrixResponse(session: AttendanceFixtureSession, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === `/api/v1${path(session)}/asistencias` &&
        res.request().method() === method,
    );
  }
  async function open(session: AttendanceFixtureSession) {
    const response = matrixResponse(session);
    await page.goto(`${origin}/#${path(session)}`);
    const loaded = await response;
    expect(loaded.status()).toBe(200);
    await page
      .getByRole('heading', { name: 'Registro de asistencia', exact: true })
      .waitFor();
    return (await loaded.json()) as MatrixResponse;
  }
  async function save(session: AttendanceFixtureSession) {
    const write = matrixResponse(session, 'PATCH');
    const read = matrixResponse(session);
    await page
      .getByRole('button', { name: 'Guardar asistencia', exact: true })
      .click();
    expect((await write).status()).toBe(200);
    const loaded = await read;
    expect(loaded.status()).toBe(200);
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    return (await loaded.json()) as MatrixResponse;
  }
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  }

  it('sin sesiones realizadas muestra porcentaje y condición pendientes hasta el primer guardado', async () => {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    const session = await fixture.session(group);
    await login();
    const initial = await open(session);
    expect(apiSummary(initial, enrollment)).toMatchObject({
      estado: 'SIN_SESIONES',
      sesionesComputables: 0,
      inasistenciaPct: null,
      excedeLimite: null,
      condicion: null,
    });
    await contains(summary(student), 'Sin sesiones computables');
    await contains(summary(student), 'Inasistencia: Pendiente');
    await contains(summary(student), 'Condición pendiente');
    expect(await summary(student).textContent()).not.toContain('NaN');
    await mark(student).selectOption('P');
    const updated = await save(session);
    expect(apiSummary(updated, enrollment)).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 1,
      marcasPendientes: 0,
      inasistenciaPct: '0.00',
      condicion: 'DENTRO_LIMITE',
    });
    await contains(summary(student), 'Inasistencia: 0,00 %');
  });

  it('muestra el 30 % permitido y recalcula el retiro al corregir P por F', async () => {
    const f = await attempt(['T', 'T', 'T', 'F', 'F', 'P', 'P', 'P', 'P', 'P']);
    await login();
    const initial = await open(f.session);
    expect(apiSummary(initial, f.enrollment)).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 10,
      tardanzas: 3,
      faltasPorTardanzas: 1,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
      cierreConfirmado: false,
    });
    await contains(summary(f.student), 'Inasistencia: 30,00 %');
    await contains(summary(f.student), 'Dentro del límite de asistencia');
    await mark(f.student).selectOption('F');
    const updated = await save(f.session);
    expect(apiSummary(updated, f.enrollment)).toMatchObject({
      estado: 'CALCULADO',
      faltasComputables: 4,
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: 'RETIRADO_INASISTENCIA',
      cierreConfirmado: false,
    });
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    await contains(summary(f.student), 'Retirado por inasistencia');
    await contains(summary(f.student), 'Faltas computables: 4');
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
    await screenshot('matriz-limite-recalculado');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot('matriz-resumen-movil');
  });

  it('guardar la tercera tardanza y corregirla recalcula sin transformar las marcas originales', async () => {
    const f = await attempt(['T', 'T', 'P', null]);
    await login();
    const initial = await open(f.session);
    expect(apiSummary(initial, f.enrollment)).toMatchObject({
      estado: 'INCOMPLETO',
      marcasPendientes: 1,
      tardanzas: 2,
      tardanzasRestantes: 2,
      faltasPorTardanzas: 0,
      condicion: null,
    });
    await mark(f.student).selectOption('T');
    const updated = await save(f.session);
    expect(apiSummary(updated, f.enrollment)).toMatchObject({
      estado: 'CALCULADO',
      tardanzas: 3,
      tardanzasRestantes: 0,
      faltasPorTardanzas: 1,
      inasistenciaPct: '25.00',
    });
    await contains(
      summary(f.student),
      'Tardanzas: 3 · Faltas por tardanzas: 1',
    );
    await breakdown(summary(f.student));
    await fact(summary(f.student), 'Tardanzas restantes', '0');
    await mark(f.student).selectOption('P');
    const corrected = await save(f.session);
    expect(apiSummary(corrected, f.enrollment)).toMatchObject({
      tardanzas: 2,
      tardanzasRestantes: 2,
      faltasPorTardanzas: 0,
      inasistenciaPct: '0.00',
    });
    await contains(summary(f.student), 'Inasistencia: 0,00 %');
    await breakdown(summary(f.student));
    await fact(summary(f.student), 'Tardanzas restantes', '2');
    const rows = (await source.query(
      'SELECT a.codigo FROM asistencias a JOIN sesiones_clase s ON s.id=a.sesion_id WHERE a.matricula_id=$1 ORDER BY s.fecha',
      [f.enrollment.id],
    )) as { codigo: Code }[];
    expect(rows.map((row) => row.codigo)).toEqual(['T', 'T', 'P', 'P']);
  });

  it('la primera marca de una sesión programada actualiza también el resumen de una fila no enviada', async () => {
    const group = await fixture.group();
    const first = await fixture.student();
    const second = await fixture.student();
    const firstEnrollment = await fixture.enroll(group, first);
    const secondEnrollment = await fixture.enroll(group, second);
    for (let offset = 3; offset > 0; offset--) {
      const session = await fixture.session(
        group,
        'REALIZADA',
        await dateBefore(offset),
      );
      await seedMark(session, firstEnrollment, offset === 3 ? 'F' : 'P');
      await seedMark(session, secondEnrollment, offset === 3 ? 'F' : 'P');
    }
    const session = await fixture.session(group);
    await login();
    const initial = await open(session);
    expect(apiSummary(initial, secondEnrollment)).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 3,
      inasistenciaPct: '33.33',
      condicion: 'RETIRADO_INASISTENCIA',
    });
    await contains(summary(second), 'Retirado por inasistencia');
    await mark(first).selectOption('P');
    const updated = await save(session);
    expect(apiSummary(updated, secondEnrollment)).toMatchObject({
      estado: 'INCOMPLETO',
      sesionesComputables: 4,
      marcasPendientes: 1,
      inasistenciaPct: '25.00',
      condicion: null,
    });
    await contains(summary(second), 'Cálculo incompleto');
    await contains(summary(second), 'Inasistencia: 25,00 %');
    await contains(summary(second), 'Condición pendiente');
    expect(await mark(second).inputValue()).toBe('');
    expect(
      await source.query(
        'SELECT id FROM asistencias WHERE sesion_id=$1 AND matricula_id=$2',
        [session.id, secondEnrollment.id],
      ),
    ).toEqual([]);
  });

  it('excluye sesiones programadas, canceladas y realizadas con fecha futura del denominador', async () => {
    const f = await attempt(['F', 'P']);
    const excluded = [
      await fixture.session(f.group, 'PROGRAMADA', await dateBefore(2)),
      await fixture.session(f.group, 'CANCELADA', await dateBefore(3)),
      await fixture.session(f.group, 'REALIZADA', fixture.tomorrow),
    ];
    for (const session of excluded) await seedMark(session, f.enrollment, 'F');
    await login();
    const initial = await open(f.session);
    expect(apiSummary(initial, f.enrollment)).toMatchObject({
      estado: 'CALCULADO',
      criterioSesiones: 'REALIZADAS_DEL_GRUPO_HASTA_HOY',
      sesionesComputables: 2,
      faltas: 1,
      faltasComputables: 1,
      inasistenciaPct: '50.00',
    });
    await contains(summary(f.student), 'Inasistencia: 50,00 %');
    await breakdown(summary(f.student));
    await fact(summary(f.student), 'Sesiones computables', '2');
    await fact(summary(f.student), 'Marcas pendientes', '0');
    await screenshot('sesiones-computables');
  });

  it('una J pendiente y marcas faltantes mantienen la condición pendiente y el cálculo provisional', async () => {
    const f = await attempt(['J', null, null]);
    await login();
    const initial = await open(f.session);
    expect(apiSummary(initial, f.enrollment)).toMatchObject({
      estado: 'INCOMPLETO',
      marcasPendientes: 2,
      justificadasPendientes: 1,
      faltasConfirmadas: 0,
      faltasComputables: 1,
      inasistenciaPct: '33.33',
      condicion: null,
    });
    await contains(summary(f.student), 'Cálculo incompleto');
    await contains(summary(f.student), 'Condición pendiente');
    expect(await summary(f.student).textContent()).not.toContain(
      'Retirado por inasistencia',
    );
    await mark(f.student).selectOption('P');
    await save(f.session);
    await open(f.classes[1]!);
    await mark(f.student).selectOption('P');
    const updated = await save(f.classes[1]!);
    expect(apiSummary(updated, f.enrollment)).toMatchObject({
      estado: 'PROVISIONAL',
      marcasPendientes: 0,
      justificadasPendientes: 1,
      faltasConfirmadas: 0,
      faltasComputables: 1,
      inasistenciaPct: '33.33',
      condicion: null,
      cierreConfirmado: false,
    });
    await contains(summary(f.student), 'Cálculo provisional');
    await contains(summary(f.student), 'Condición pendiente');
    await contains(summary(f.student), 'Inasistencia: 33,33 %');
    await breakdown(summary(f.student));
    await fact(summary(f.student), 'Justificaciones pendientes', '1');
    await screenshot('justificacion-provisional');
  });

  it('el historial comparte el resumen por intento y distingue qué sesiones computan', async () => {
    const student = await fixture.student();
    const oldGroup = await fixture.group();
    const group = await fixture.group();
    const oldEnrollment = await fixture.enroll(oldGroup, student, 'CERRADA');
    const enrollment = await fixture.enroll(group, student);
    for (const session of await realSessions(oldGroup, 3))
      await seedMark(session, oldEnrollment, 'F');
    for (const session of await realSessions(group, 3))
      await seedMark(session, enrollment, 'P');
    const excluded = [
      await fixture.session(group, 'PROGRAMADA', await dateBefore(3)),
      await fixture.session(group, 'CANCELADA', await dateBefore(4)),
      await fixture.session(group, 'REALIZADA', fixture.tomorrow),
    ];
    await login('coordinador');
    const historyRead = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname ===
        `/api/v1/estudiantes/${student.id}/historial`,
    );
    await page.goto(`${origin}/#/estudiantes/${student.id}`);
    const response = await historyRead;
    expect(response.status()).toBe(200);
    const history = (await response.json()) as {
      items: { id: string; resumenAsistencia: Record<string, unknown> }[];
    };
    const current = history.items.find((row) => row.id === enrollment.id)!;
    expect(current.resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 3,
      inasistenciaPct: '0.00',
      condicion: 'DENTRO_LIMITE',
    });
    expect(
      history.items.find((row) => row.id === oldEnrollment.id)!
        .resumenAsistencia,
    ).toMatchObject({
      sesionesComputables: 3,
      inasistenciaPct: '100.00',
      condicion: 'RETIRADO_INASISTENCIA',
    });
    const currentSummary = page.getByRole('region', {
      name: 'Resumen de asistencia del intento 2',
      exact: true,
    });
    await contains(currentSummary, 'Inasistencia: 0,00 %');
    await contains(currentSummary, 'Dentro del límite de asistencia');
    await contains(
      page.getByRole('region', {
        name: 'Resumen de asistencia del intento 1',
        exact: true,
      }),
      'Inasistencia: 100,00 %',
    );
    const detailRead = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname ===
        `/api/v1/estudiantes/${student.id}/historial/${enrollment.id}`,
    );
    await page
      .getByRole('button', { name: 'Consultar intento 2', exact: true })
      .click();
    const detailResponse = await detailRead;
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as {
      resumenAsistencia: Record<string, unknown>;
      asistencias: { id: string; computable: boolean }[];
    };
    expect(detail.resumenAsistencia).toEqual(current.resumenAsistencia);
    expect(detail.asistencias.filter((row) => row.computable)).toHaveLength(3);
    expect(
      detail.asistencias
        .filter((row) => !row.computable)
        .map((row) => row.id)
        .sort(),
    ).toEqual(excluded.map((row) => row.id).sort());
    const dialog = page.getByRole('dialog');
    const detailSummary = dialog.getByRole('region', {
      name: 'Resumen de asistencia guardada',
      exact: true,
    });
    await fact(detailSummary, 'Sesiones computables', '3');
    const table = dialog.getByRole('table', {
      name: 'Asistencia registrada',
      exact: true,
    });
    await table
      .getByRole('columnheader', { name: 'Computa en asistencia', exact: true })
      .waitFor();
    expect(
      await table.getByRole('cell', { name: 'Sí', exact: true }).count(),
    ).toBe(3);
    expect(
      await table.getByRole('cell', { name: 'No', exact: true }).count(),
    ).toBe(3);
    expect(await dialog.textContent()).not.toContain('Inasistencia: 100,00 %');
    await screenshot('historial-resumen-intento');
  });

  it('distingue la asistencia del resultado confirmado de la proyección actual y conserva el snapshot', async () => {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student, 'CERRADA');
    for (const session of await realSessions(group, 4))
      await seedMark(session, enrollment, 'F');
    await source.query(
      `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at)
       VALUES($1,15.50,16,3,1,25,'APROBADO',now())`,
      [enrollment.id],
    );
    const snapshot = await source.query(
      'SELECT * FROM resultados_academicos WHERE matricula_id=$1',
      [enrollment.id],
    );
    await login('coordinador');
    const historyRead = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname ===
        `/api/v1/estudiantes/${student.id}/historial`,
    );
    await page.goto(`${origin}/#/estudiantes/${student.id}`);
    const response = await historyRead;
    expect(response.status()).toBe(200);
    const history = (await response.json()) as {
      items: {
        id: string;
        resultado: Record<string, unknown>;
        resumenAsistencia: Record<string, unknown>;
      }[];
    };
    const attempt = history.items.find((row) => row.id === enrollment.id)!;
    expect(attempt.resultado).toMatchObject({
      promedio: '15.50',
      notaOficial: 16,
      tardanzas: 3,
      faltasEquivalentes: '1.00',
      inasistenciaPct: '25.00',
      condicion: 'APROBADO',
      confirmadoAt: expect.any(String),
    });
    expect(attempt.resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 4,
      inasistenciaPct: '100.00',
      condicion: 'RETIRADO_INASISTENCIA',
      cierreConfirmado: false,
    });
    const historical = page.getByRole('region', {
      name: 'Asistencia del resultado confirmado',
      exact: true,
    });
    const current = page.getByRole('region', {
      name: 'Resumen de asistencia del intento 1',
      exact: true,
    });
    await contains(historical, 'Asistencia del resultado confirmado');
    await contains(historical, 'Inasistencia: 25,00 %');
    await contains(historical, 'Tardanzas: 3');
    await contains(historical, 'Faltas equivalentes: 1.00');
    await contains(current, 'Inasistencia: 100,00 %');
    await contains(current, 'Retirado por inasistencia');
    await page
      .getByText('Resultado confirmado: Aprobado', { exact: true })
      .waitFor();
    expect(await historical.textContent()).not.toContain('100,00 %');
    expect(await current.textContent()).not.toContain('25,00 %');
    const detailRead = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname ===
        `/api/v1/estudiantes/${student.id}/historial/${enrollment.id}`,
    );
    await page
      .getByRole('button', { name: 'Consultar intento 1', exact: true })
      .click();
    const detailResponse = await detailRead;
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as {
      resultado: Record<string, unknown>;
      resumenAsistencia: Record<string, unknown>;
    };
    expect(detail.resultado).toEqual(attempt.resultado);
    expect(detail.resumenAsistencia).toEqual(attempt.resumenAsistencia);
    const dialog = page.getByRole('dialog');
    const historicalDetail = dialog.getByRole('region', {
      name: 'Asistencia del resultado confirmado',
      exact: true,
    });
    const currentDetail = dialog.getByRole('region', {
      name: 'Resumen de asistencia guardada',
      exact: true,
    });
    await contains(historicalDetail, 'Inasistencia: 25,00 %');
    await fact(currentDetail, 'Inasistencia', '100,00 %');
    await contains(currentDetail, 'Retirado por inasistencia');
    await dialog
      .getByText('Resultado confirmado: Aprobado', { exact: true })
      .waitFor();
    expect(await currentDetail.textContent()).not.toContain('25,00 %');
    expect(
      await source.query(
        'SELECT * FROM resultados_academicos WHERE matricula_id=$1',
        [enrollment.id],
      ),
    ).toEqual(snapshot);
    await screenshot('historial-resultado-confirmado-y-proyeccion');
  });

  it('un fallo de consulta posterior al guardado oculta cifras antiguas y permite recuperarlas', async () => {
    const f = await attempt(['P', 'P', null]);
    await login();
    await open(f.session);
    await contains(summary(f.student), 'Inasistencia: 0,00 %');
    const routePattern = `**/api/v1${path(f.session)}/asistencias*`;
    await page.route(routePattern, async (route) => {
      if (route.request().method() === 'GET')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Consulta sintética no disponible' }),
        });
      else await route.continue();
    });
    await mark(f.student).selectOption('F');
    const write = matrixResponse(f.session, 'PATCH');
    const read = matrixResponse(f.session);
    await page
      .getByRole('button', { name: 'Guardar asistencia', exact: true })
      .click();
    expect((await write).status()).toBe(200);
    expect((await read).status()).toBe(503);
    await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
    await contains(summary(f.student), 'Resumen no actualizado');
    expect(await summary(f.student).textContent()).not.toContain(
      'Inasistencia: 0,00 %',
    );
    expect(await mark(f.student).inputValue()).toBe('F');
    const [saved] = (await source.query(
      'SELECT codigo,version FROM asistencias WHERE sesion_id=$1 AND matricula_id=$2',
      [f.session.id, f.enrollment.id],
    )) as { codigo: Code; version: number }[];
    expect(saved).toMatchObject({ codigo: 'F', version: 1 });
    await screenshot('resumen-no-actualizado');
    await page.unroute(routePattern);
    const reloaded = matrixResponse(f.session);
    await page
      .getByRole('button', { name: 'Recargar asistencia', exact: true })
      .click();
    expect((await reloaded).status()).toBe(200);
    await contains(summary(f.student), 'Inasistencia: 33,33 %');
    await contains(summary(f.student), 'Retirado por inasistencia');
    await mark(f.student).selectOption('P');
    await save(f.session);
    await contains(summary(f.student), 'Inasistencia: 0,00 %');
  });
});
