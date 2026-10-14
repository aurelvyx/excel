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
  type AttendanceFixtureGroup,
  type AttendanceFixtureSession,
  type AttendanceFixtureStudent,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B15 con pnpm test:db');
const password = 'Sintetica-B15-navegador';
const adminName = 'admin_b15_web';
const artifacts = fileURLToPath(new URL('../../../.tmp/b15/', import.meta.url));
type Code = 'P' | 'F' | 'T' | 'J';
type ClosureReview = {
  revision: string;
  cierre: null | {
    id: string;
    estado: string;
    realizado_por: string;
    fecha_corte: string;
  };
  advertencias: { marcasPendientes: number; justificacionesPendientes: number };
  items: { matricula_id: string; resumenAsistencia: Record<string, unknown> }[];
};

describe('B15 navegador React → API → PostgreSQL', () => {
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
  const actors = new Map<string, { context: BrowserContext; csrf: string }>();
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_attendance_closure_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_closure_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(source, adminName, password);
    adminId = admin.id;
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
    for (const actor of actors.values()) await actor.context.close();
    await browser?.close();
    await vite?.close();
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });

  const closurePath = (g: AttendanceFixtureGroup) =>
    `/asistencia/grupos/${g.id}/cierre`;
  const closureEndpoint = (g: AttendanceFixtureGroup) =>
    `/api/v1${closurePath(g)}`;
  const matrixPath = (s: AttendanceFixtureSession) =>
    `/asistencia/grupos/${s.grupo_id}/sesiones/${s.id}`;
  const matrixEndpoint = (s: AttendanceFixtureSession) =>
    `/api/v1${matrixPath(s)}/asistencias`;
  const summary = (owner: AttendanceFixtureStudent) =>
    page.getByRole('region', {
      name: `Resumen de asistencia de ${owner.nombre}`,
      exact: true,
    });
  const matrixRow = (owner: AttendanceFixtureStudent) =>
    page
      .getByRole('table', { name: 'Asistencia de la sesión', exact: true })
      .getByRole('row')
      .filter({
        has: page.getByText(`SINTETICO ${owner.documento}`, { exact: true }),
      });
  const mark = (owner: AttendanceFixtureStudent) =>
    page.getByLabel(`Asistencia de ${owner.nombre}`, { exact: true });
  async function contains(locator: Locator, text: string) {
    await expect.poll(() => locator.textContent()).toContain(text);
  }
  async function fact(locator: Locator, label: string, value: string) {
    await expect
      .poll(() =>
        locator
          .getByText(label, { exact: true })
          .locator('..')
          .locator('dd')
          .textContent(),
      )
      .toBe(value);
  }
  function response(pathname: string, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === pathname &&
        res.request().method() === method,
    );
  }
  async function login(name = adminName) {
    await context.clearCookies();
    const cookies = sessions.get(name);
    if (cookies) await context.addCookies(cookies);
    await page.goto(origin);
    if (!cookies) {
      await page.getByLabel('Usuario', { exact: true }).fill(name);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      const logged = response('/api/v1/auth/login', 'POST');
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      expect((await logged).status()).toBe(200);
    }
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .waitFor();
    if (!cookies) sessions.set(name, await context.cookies());
  }
  async function apiActor(name = adminName) {
    const previous = actors.get(name);
    if (previous) return previous;
    const actorContext = await browser.newContext();
    const logged = await actorContext.request.post(
      `${origin}/api/v1/auth/login`,
      {
        headers: { Origin: origin, 'X-Requested-With': 'Excel-Web' },
        data: { nombreUsuario: name, password },
      },
    );
    expect(logged.status()).toBe(200);
    const actor = {
      context: actorContext,
      csrf: (await logged.json()).csrfToken as string,
    };
    actors.set(name, actor);
    return actor;
  }
  async function apiWrite(
    name: string,
    pathname: string,
    method: 'POST' | 'PATCH',
    data: unknown,
  ) {
    const actor = await apiActor(name);
    return actor.context.request.fetch(`${origin}${pathname}`, {
      method,
      data,
      headers: {
        Origin: origin,
        'X-Requested-With': 'Excel-Web',
        'X-CSRF-Token': actor.csrf,
      },
    });
  }
  async function fixtureGroup(
    codes: (Code | null)[] = ['F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ) {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    const classSessions: AttendanceFixtureSession[] = [];
    const attendanceIds: (string | null)[] = [];
    for (const [index, code] of codes.entries()) {
      const [date] = await source.query(
        'SELECT ($1::date-$2::int)::text AS fecha',
        [fixture.today, codes.length - index - 1],
      );
      const session = await fixture.session(group, 'REALIZADA', date.fecha);
      classSessions.push(session);
      if (code === null) attendanceIds.push(null);
      else {
        const [saved] = await source.query(
          'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [group.id, session.id, enrollment.id, code, fixture.userIds.docente],
        );
        attendanceIds.push(saved.id);
      }
    }
    return { group, student, enrollment, classSessions, attendanceIds };
  }
  async function openClosure(g: AttendanceFixtureGroup) {
    const loaded = response(closureEndpoint(g));
    await page.goto(`${origin}/#${closurePath(g)}`);
    const result = await loaded;
    expect(result.status()).toBe(200);
    await page
      .getByRole('heading', { name: 'Cierre de asistencia', exact: true })
      .waitFor();
    return (await result.json()) as ClosureReview;
  }
  async function openMatrix(s: AttendanceFixtureSession) {
    const loaded = response(matrixEndpoint(s));
    await page.goto(`${origin}/#${matrixPath(s)}`);
    const result = await loaded;
    expect(result.status()).toBe(200);
    await page
      .getByRole('heading', { name: 'Registro de asistencia', exact: true })
      .waitFor();
    return result;
  }
  async function closeWithApi(g: AttendanceFixtureGroup) {
    const actor = await apiActor();
    const read = await actor.context.request.get(
      `${origin}${closureEndpoint(g)}`,
    );
    expect(read.status()).toBe(200);
    const review = (await read.json()) as ClosureReview;
    const closed = await apiWrite(adminName, closureEndpoint(g), 'POST', {
      revision: review.revision,
      confirmarPendientes: true,
      motivo: 'Cierre sintético B15 preparado por API',
    });
    expect(closed.status()).toBe(201);
    return (await closed.json()) as ClosureReview;
  }
  async function correctionDialog(owner: AttendanceFixtureStudent) {
    await matrixRow(owner)
      .getByRole('button', { name: 'Corregir asistencia', exact: true })
      .click();
    return page.getByRole('dialog', {
      name: 'Corregir asistencia',
      exact: true,
    });
  }
  async function correct(
    s: AttendanceFixtureSession,
    owner: AttendanceFixtureStudent,
    code: Code,
    reason: string,
    note = '',
  ) {
    const dialog = await correctionDialog(owner);
    if (!(await dialog.getByLabel('Nueva marca', { exact: true }).isDisabled()))
      await dialog
        .getByLabel('Nueva marca', { exact: true })
        .selectOption(code);
    await dialog.getByLabel('Observación', { exact: true }).fill(note);
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill(reason);
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    const written = response(`${matrixEndpoint(s)}/correccion`, 'PATCH');
    const refreshed = response(matrixEndpoint(s));
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    const result = await written;
    expect(result.status()).toBe(200);
    expect((await refreshed).status()).toBe(200);
    await page
      .getByText('Corrección de asistencia registrada.', { exact: true })
      .waitFor();
    return result;
  }
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  }

  it('administrador revisa pendientes, confirma explícitamente y cierra sin crear marcas ni resolver J', async () => {
    const f = await fixtureGroup([
      'F',
      'F',
      'F',
      'J',
      'P',
      'P',
      'P',
      'P',
      'P',
      'P',
    ]);
    const unmarked = await fixture.student();
    const otherEnrollment = await fixture.enroll(f.group, unmarked);
    await fixture.session(f.group, 'PROGRAMADA', fixture.tomorrow);
    await login();
    const before = await openClosure(f.group);
    expect(before.advertencias).toMatchObject({
      marcasPendientes: 10,
      justificacionesPendientes: 1,
    });
    const warnings = page.getByRole('region', {
      name: 'Revisión de asistencia',
      exact: true,
    });
    await fact(warnings, 'Sesiones computables', '10');
    await fact(warnings, 'Sesiones programadas', '1');
    await fact(warnings, 'Marcas pendientes', '10');
    await contains(summary(f.student), 'Condición pendiente');
    await page
      .getByRole('button', { name: 'Cerrar asistencia', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cerrar asistencia',
      exact: true,
    });
    await dialog
      .getByRole('button', { name: 'Revisar cierre', exact: true })
      .click();
    await contains(
      dialog,
      'Confirma que revisaste los pendientes y las advertencias.',
    );
    await dialog
      .getByLabel('Motivo del cierre', { exact: true })
      .fill('Revisión sintética completa del grupo B15');
    await dialog
      .getByLabel('Confirmo que revisé los pendientes y las advertencias', {
        exact: true,
      })
      .check();
    await dialog
      .getByRole('button', { name: 'Revisar cierre', exact: true })
      .click();
    expect(
      await source.query(
        'SELECT id FROM cierres_academicos WHERE grupo_id=$1',
        [f.group.id],
      ),
    ).toEqual([]);
    const written = response(closureEndpoint(f.group), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre', exact: true })
      .click();
    const result = await written;
    expect(result.status()).toBe(201);
    const after = (await result.json()) as ClosureReview;
    expect(after.cierre).toMatchObject({
      estado: 'CERRADO',
      realizado_por: adminId,
      fecha_corte: fixture.today,
    });
    expect(
      after.items.find((row) => row.matricula_id === f.enrollment.id)!
        .resumenAsistencia,
    ).toMatchObject({
      cierreConfirmado: true,
      estado: 'CALCULADO',
      faltasComputables: 4,
      faltasConfirmadas: 4,
      inasistenciaPct: '40.00',
      condicion: 'RETIRADO_INASISTENCIA',
    });
    expect(
      after.items.find((row) => row.matricula_id === otherEnrollment.id)!
        .resumenAsistencia,
    ).toMatchObject({
      cierreConfirmado: true,
      estado: 'INCOMPLETO',
      marcasPendientes: 10,
      condicion: null,
    });
    await page.getByText('Asistencia cerrada.', { exact: true }).waitFor();
    await contains(summary(f.student), 'Retirado por inasistencia');
    await contains(summary(unmarked), 'Cálculo incompleto');
    await fact(
      page.getByRole('region', { name: 'Cierre registrado', exact: true }),
      'Cerrada por',
      adminName,
    );
    expect(
      await page
        .getByRole('table', {
          name: 'Historial de cierre de asistencia',
          exact: true,
        })
        .locator('tbody tr')
        .count(),
    ).toBe(1);
    expect(
      await source.query(
        'SELECT j.id FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=$1',
        [f.group.id],
      ),
    ).toEqual([]);
    expect(
      (
        await source.query(
          'SELECT count(*)::int AS n FROM asistencias WHERE grupo_id=$1',
          [f.group.id],
        )
      )[0].n,
    ).toBe(10);
    expect(
      (
        await source.query(
          'SELECT g.estado,p.estado AS periodo_estado FROM grupos g JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=$1',
          [f.group.id],
        )
      )[0],
    ).toMatchObject({ estado: 'ACTIVO', periodo_estado: 'ABIERTO' });
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[])',
        [[f.enrollment.id, otherEnrollment.id]],
      ),
    ).toEqual([]);
    await screenshot('cierre-confirmado-escritorio');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await screenshot('cierre-confirmado-movil');
  });

  it('docente conserva consulta tras cerrar, no tiene controles de edición y recibe denegación al corregir', async () => {
    const f = await fixtureGroup(['P']);
    const closed = await closeWithApi(f.group);
    const session = f.classSessions[0]!;
    await login('docente');
    await openMatrix(session);
    await contains(matrixRow(f.student), 'P · Presente');
    expect(await mark(f.student).count()).toBe(0);
    expect(
      await page
        .getByLabel(`Observación de ${f.student.nombre}`, { exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole('button', { name: 'Corregir asistencia', exact: true })
        .count(),
    ).toBe(0);
    await contains(page.getByText(/Solo lectura/).first(), 'cerrada');
    const denied = await apiWrite(
      'docente',
      `${matrixEndpoint(session)}/correccion`,
      'PATCH',
      {
        matriculaId: f.enrollment.id,
        codigo: 'F',
        version: 1,
        motivo: 'Intento docente sintético no autorizado',
        cierreId: closed.cierre!.id,
      },
    );
    expect(denied.status()).toBe(403);
    const ordinary = await apiWrite(
      'docente',
      matrixEndpoint(session),
      'PATCH',
      {
        registros: [{ matriculaId: f.enrollment.id, codigo: 'F', version: 1 }],
      },
    );
    expect(ordinary.status()).toBe(409);
    await openClosure(f.group);
    expect(
      await page
        .getByRole('button', { name: 'Cerrar asistencia', exact: true })
        .count(),
    ).toBe(0);
    expect(
      (
        await source.query(
          'SELECT codigo,version FROM asistencias WHERE id=$1',
          [f.attendanceIds[0]],
        )
      )[0],
    ).toMatchObject({ codigo: 'P', version: 1 });
  });

  it('administrador corrige P a F con motivo, recalcula 30 % a 40 % y conserva responsables e historial', async () => {
    const f = await fixtureGroup();
    await closeWithApi(f.group);
    const session = f.classSessions[3]!;
    await login();
    await openMatrix(session);
    await contains(summary(f.student), 'Inasistencia: 30,00 %');
    await correct(
      session,
      f.student,
      'F',
      'Corrección sintética por revisión posterior',
      'Ausencia comprobada en revisión sintética',
    );
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    await contains(summary(f.student), 'Retirado por inasistencia');
    expect(
      (
        await source.query(
          'SELECT codigo,observacion,version,registrado_por,actualizado_at FROM asistencias WHERE id=$1',
          [f.attendanceIds[3]],
        )
      )[0],
    ).toMatchObject({
      codigo: 'F',
      version: 2,
      registrado_por: fixture.userIds.docente,
    });
    const changed = await source.query(
      "SELECT usuario_id,motivo,valor_anterior,valor_nuevo,ocurrido_at FROM auditoria_eventos WHERE entidad='asistencias' AND entidad_id=$1 AND accion='CORRECT_AFTER_CLOSE'",
      [f.attendanceIds[3]],
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      usuario_id: adminId,
      motivo: 'Corrección sintética por revisión posterior',
      valor_anterior: { codigo: 'P', version: 1 },
      valor_nuevo: { codigo: 'F', version: 2 },
    });
    expect(Number.isFinite(Date.parse(changed[0].ocurrido_at))).toBe(true);
    const historyRead = response(
      `${matrixEndpoint(session)}/${f.enrollment.id}/historial`,
    );
    await matrixRow(f.student)
      .getByRole('button', { name: 'Ver historial de asistencia', exact: true })
      .click();
    expect((await historyRead).status()).toBe(200);
    const dialog = page.getByRole('dialog', {
      name: 'Historial de asistencia',
      exact: true,
    });
    const history = dialog.getByRole('table', {
      name: 'Cambios de asistencia',
      exact: true,
    });
    await contains(history, 'Corrección administrativa');
    await contains(history, adminName);
    await contains(history, 'P · Presente');
    await contains(history, 'F · Falta');
    await contains(history, 'Corrección sintética por revisión posterior');
    await history.scrollIntoViewIfNeeded();
    await screenshot('correccion-historial-escritorio');
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
  });

  it('una marca faltante de una matrícula histórica sigue pendiente al cerrar y su alta administrativa exige motivo y confirmación', async () => {
    const f = await fixtureGroup([null]);
    await source.query("UPDATE matriculas SET estado='CERRADA' WHERE id=$1", [
      f.enrollment.id,
    ]);
    const closed = await closeWithApi(f.group);
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      estado: 'INCOMPLETO',
      marcasPendientes: 1,
      condicion: null,
    });
    await login();
    const session = f.classSessions[0]!;
    await openMatrix(session);
    const dialog = await correctionDialog(f.student);
    await dialog.getByLabel('Nueva marca', { exact: true }).selectOption('P');
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    await contains(dialog, 'Indica el motivo de la corrección.');
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill('Completar marca pendiente según revisión sintética');
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    expect(
      await source.query('SELECT id FROM asistencias WHERE sesion_id=$1', [
        session.id,
      ]),
    ).toEqual([]);
    const written = response(`${matrixEndpoint(session)}/correccion`, 'PATCH');
    const refreshed = response(matrixEndpoint(session));
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    expect((await written).status()).toBe(200);
    expect((await refreshed).status()).toBe(200);
    await contains(summary(f.student), 'Dentro del límite de asistencia');
    await contains(summary(f.student), 'Inasistencia: 0,00 %');
    expect(
      (
        await source.query(
          'SELECT codigo,version,registrado_por FROM asistencias WHERE sesion_id=$1',
          [session.id],
        )
      )[0],
    ).toMatchObject({ codigo: 'P', version: 1, registrado_por: adminId });
    expect(
      (
        await source.query(
          "SELECT valor_anterior FROM auditoria_eventos WHERE entidad='asistencias' AND accion='CORRECT_AFTER_CLOSE' AND valor_nuevo->>'sesion_id'=$1",
          [session.id],
        )
      )[0].valor_anterior,
    ).toBeNull();
  });

  it('el cierre con revisión obsoleta conserva motivo, oculta cifras y exige recarga explícita', async () => {
    const f = await fixtureGroup(['P']);
    const session = f.classSessions[0]!;
    await login();
    await openClosure(f.group);
    await page
      .getByRole('button', { name: 'Cerrar asistencia', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cerrar asistencia',
      exact: true,
    });
    const reason = 'Motivo sintético conservado ante nueva asistencia';
    await dialog.getByLabel('Motivo del cierre', { exact: true }).fill(reason);
    const concurrent = await apiWrite(
      'docente',
      matrixEndpoint(session),
      'PATCH',
      {
        registros: [{ matriculaId: f.enrollment.id, codigo: 'F', version: 1 }],
      },
    );
    expect(concurrent.status()).toBe(200);
    await dialog
      .getByRole('button', { name: 'Revisar cierre', exact: true })
      .click();
    const failed = response(closureEndpoint(f.group), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre', exact: true })
      .click();
    expect((await failed).status()).toBe(409);
    await contains(dialog.getByRole('alert'), 'cambió desde la revisión');
    expect(
      await dialog
        .getByLabel('Motivo del cierre', { exact: true })
        .inputValue(),
    ).toBe(reason);
    expect(
      await dialog
        .getByLabel('Motivo del cierre', { exact: true })
        .isDisabled(),
    ).toBe(true);
    await contains(summary(f.student), 'Resumen no actualizado');
    expect(
      await source.query(
        'SELECT id FROM cierres_academicos WHERE grupo_id=$1',
        [f.group.id],
      ),
    ).toEqual([]);
    await screenshot('cierre-conflicto');
    await dialog
      .getByRole('button', { name: 'Recargar cierre', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await dialog
        .getByLabel('Motivo del cierre', { exact: true })
        .inputValue(),
    ).toBe(reason);
    await dialog
      .getByRole('button', { name: 'Recargar cierre', exact: true })
      .click();
    const reloaded = response(closureEndpoint(f.group));
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await reloaded).status()).toBe(200);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    await contains(summary(f.student), 'Inasistencia: 100,00 %');
    expect(
      await page
        .getByRole('button', { name: 'Cerrar asistencia', exact: true })
        .isEnabled(),
    ).toBe(true);
  });

  it('una corrección concurrente conserva la captura obsoleta y recargar requiere descartar explícitamente', async () => {
    const f = await fixtureGroup(['P']);
    const closed = await closeWithApi(f.group);
    const session = f.classSessions[0]!;
    await login();
    await openMatrix(session);
    const dialog = await correctionDialog(f.student);
    await dialog.getByLabel('Nueva marca', { exact: true }).selectOption('F');
    await dialog
      .getByLabel('Observación', { exact: true })
      .fill('Captura sintética conservada');
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill('Motivo sintético capturado antes del conflicto');
    const concurrent = await apiWrite(
      adminName,
      `${matrixEndpoint(session)}/correccion`,
      'PATCH',
      {
        matriculaId: f.enrollment.id,
        codigo: 'T',
        version: 1,
        cierreId: closed.cierre!.id,
        motivo: 'Corrección concurrente sintética',
      },
    );
    expect(concurrent.status()).toBe(200);
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    const failed = response(`${matrixEndpoint(session)}/correccion`, 'PATCH');
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    expect((await failed).status()).toBe(409);
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).inputValue(),
    ).toBe('F');
    expect(
      await dialog.getByLabel('Observación', { exact: true }).inputValue(),
    ).toBe('Captura sintética conservada');
    expect(
      await dialog
        .getByLabel('Motivo de corrección', { exact: true })
        .isDisabled(),
    ).toBe(true);
    await contains(summary(f.student), 'Resumen no actualizado');
    await screenshot('correccion-conflicto');
    await dialog
      .getByRole('button', { name: 'Recargar asistencia', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).inputValue(),
    ).toBe('F');
    await dialog
      .getByRole('button', { name: 'Recargar asistencia', exact: true })
      .click();
    const reloaded = response(matrixEndpoint(session));
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await reloaded).status()).toBe(200);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    await contains(matrixRow(f.student), 'T · Tardanza');
    expect(
      (
        await source.query(
          'SELECT codigo,version FROM asistencias WHERE id=$1',
          [f.attendanceIds[0]],
        )
      )[0],
    ).toMatchObject({ codigo: 'T', version: 2 });
    expect(
      (
        await source.query(
          "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='asistencias' AND entidad_id=$1 AND accion='CORRECT_AFTER_CLOSE'",
          [f.attendanceIds[0]],
        )
      )[0].n,
    ).toBe(1);
  });

  it('secretaría y coordinación consultan cierre y matriz sin adquirir corrección administrativa', async () => {
    const f = await fixtureGroup(['P']);
    await closeWithApi(f.group);
    for (const actor of ['secretaria', 'coordinador']) {
      await login(actor);
      await openClosure(f.group);
      expect(
        await page
          .getByRole('button', { name: 'Cerrar asistencia', exact: true })
          .count(),
      ).toBe(0);
      await contains(
        page.getByRole('region', { name: 'Cierre registrado', exact: true }),
        adminName,
      );
      await openMatrix(f.classSessions[0]!);
      await contains(matrixRow(f.student), 'P · Presente');
      expect(await mark(f.student).count()).toBe(0);
      expect(
        await page
          .getByRole('button', { name: 'Corregir asistencia', exact: true })
          .count(),
      ).toBe(0);
      await matrixRow(f.student)
        .getByRole('button', {
          name: 'Ver historial de asistencia',
          exact: true,
        })
        .click();
      await page
        .getByRole('dialog', { name: 'Historial de asistencia', exact: true })
        .waitFor();
    }
  });

  it('una J con expediente conserva su marca y la captura administrativa queda protegida al navegar o cerrar el formulario', async () => {
    const f = await fixtureGroup(['J']);
    const endpoint = `/api/v1/asistencia/grupos/${f.group.id}/justificaciones`;
    const registered = await apiWrite('secretaria', endpoint, 'POST', {
      asistenciaId: f.attendanceIds[0],
      asistenciaVersion: 1,
      motivo: 'Solicitud sintética conservada en cierre',
      fechaPresentacion: fixture.today,
    });
    expect(registered.status()).toBe(201);
    const requestId = (await registered.json()).justificacion.id as string;
    await closeWithApi(f.group);
    await login();
    const session = f.classSessions[0]!;
    await openMatrix(session);
    const dialog = await correctionDialog(f.student);
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).isDisabled(),
    ).toBe(true);
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).inputValue(),
    ).toBe('J');
    await dialog
      .getByLabel('Observación', { exact: true })
      .fill('Observación sintética corregida sin sustituir J');
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill('Rectificar observación administrativa sintética');
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(new URL(page.url()).hash).toBe(`#${matrixPath(session)}`);
    expect(
      await dialog.getByLabel('Observación', { exact: true }).inputValue(),
    ).toBe('Observación sintética corregida sin sustituir J');
    await page.keyboard.press('Escape');
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot('correccion-movil');
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    const written = response(`${matrixEndpoint(session)}/correccion`, 'PATCH');
    const refreshed = response(matrixEndpoint(session));
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    expect((await written).status()).toBe(200);
    expect((await refreshed).status()).toBe(200);
    expect(
      (
        await source.query(
          'SELECT codigo,observacion,version FROM asistencias WHERE id=$1',
          [f.attendanceIds[0]],
        )
      )[0],
    ).toMatchObject({
      codigo: 'J',
      version: 2,
      observacion: 'Observación sintética corregida sin sustituir J',
    });
    expect(
      (
        await source.query(
          'SELECT estado,version FROM justificaciones WHERE id=$1',
          [requestId],
        )
      )[0],
    ).toMatchObject({ estado: 'PENDIENTE', version: 1 });
  });
});
