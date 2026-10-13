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
  type AttendanceFixtureEnrollment,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B14 con pnpm test:db');
const password = 'Sintetica-B14-navegador';
const artifacts = fileURLToPath(new URL('../../../.tmp/b14/', import.meta.url));
type Code = 'P' | 'F' | 'T' | 'J';
type Absence = {
  asistencia_id: string;
  asistencia_version: number;
  justificacion: null | {
    id: string;
    version: number;
    estado: string;
    registrado_por: string;
    resuelto_por: string | null;
    recuperacion_confirmada_por: string | null;
  };
  resumenAsistencia: Record<string, unknown>;
};

describe('B14 navegador React → API → PostgreSQL', () => {
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
  const actors = new Map<string, { context: BrowserContext; csrf: string }>();

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_justifications_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_justifications_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(
      source,
      'admin_b14_web',
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
    for (const actor of actors.values()) await actor.context.close();
    await browser?.close();
    await vite?.close();
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });

  const route = (g: AttendanceFixtureGroup) =>
    `/asistencia/grupos/${g.id}/justificaciones`;
  const endpoint = (g: AttendanceFixtureGroup) => `/api/v1${route(g)}`;
  const table = () =>
    page.getByRole('table', { name: 'Justificaciones del grupo', exact: true });
  const row = (student: AttendanceFixtureStudent) =>
    table()
      .getByRole('row')
      .filter({
        has: page.getByText(`SINTETICO ${student.documento}`, { exact: true }),
      });
  const summary = (student: AttendanceFixtureStudent) =>
    row(student).getByRole('region', {
      name: `Resumen de asistencia de ${student.nombre}`,
      exact: true,
    });
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
  function response(pathname: string, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === pathname &&
        res.request().method() === method,
    );
  }
  async function login(name = 'secretaria') {
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
  async function apiActor(name: string) {
    const previous = actors.get(name);
    if (previous) return previous;
    const actorContext = await browser.newContext();
    const result = await actorContext.request.post(
      `${origin}/api/v1/auth/login`,
      {
        headers: { Origin: origin, 'X-Requested-With': 'Excel-Web' },
        data: { nombreUsuario: name, password },
      },
    );
    expect(result.status()).toBe(200);
    const actor = {
      context: actorContext,
      csrf: (await result.json()).csrfToken as string,
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
  async function open(g: AttendanceFixtureGroup, query = '') {
    const loaded = response(endpoint(g));
    await page.goto(`${origin}/#${route(g)}${query}`);
    const result = await loaded;
    expect(result.status()).toBe(200);
    await page
      .getByRole('heading', { name: 'Justificaciones', exact: true })
      .waitFor();
    await table().waitFor();
    return (await result.json()) as {
      items: Absence[];
      nextCursor: string | null;
    };
  }
  async function seedMark(
    s: AttendanceFixtureSession,
    m: AttendanceFixtureEnrollment,
    code: Code,
  ) {
    const [saved] = await source.query(
      'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [s.grupo_id, s.id, m.id, code, fixture.userIds.docente],
    );
    return saved.id as string;
  }
  async function absence(
    codes: Code[] = ['F', 'F', 'F', 'J', 'P', 'P', 'P', 'P', 'P', 'P'],
    assigned = true,
  ) {
    const group = await fixture.group(assigned);
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    let attendanceId = '';
    let session: AttendanceFixtureSession | undefined;
    for (const [index, code] of codes.entries()) {
      const [date] = await source.query(
        'SELECT ($1::date-$2::int)::text AS fecha',
        [fixture.today, codes.length - index - 1],
      );
      const s = await fixture.session(group, 'REALIZADA', date.fecha);
      const id = await seedMark(s, enrollment, code);
      if (code === 'J') {
        attendanceId = id;
        session = s;
      }
    }
    return { group, student, enrollment, attendanceId, session: session! };
  }
  async function register(
    g: AttendanceFixtureGroup,
    student: AttendanceFixtureStudent,
    reason = 'Motivo sintético B14',
  ) {
    await row(student)
      .getByRole('button', { name: 'Registrar justificación', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Registrar justificación',
      exact: true,
    });
    await dialog.getByLabel('Motivo', { exact: true }).fill(reason);
    await dialog
      .getByLabel('Fecha de presentación', { exact: true })
      .fill(fixture.today);
    await dialog
      .getByRole('button', { name: 'Revisar solicitud', exact: true })
      .click();
    const written = response(endpoint(g), 'POST');
    const listed = response(endpoint(g));
    await dialog
      .getByRole('button', { name: 'Confirmar solicitud', exact: true })
      .click();
    const result = await written;
    expect(result.status()).toBe(201);
    expect((await listed).status()).toBe(200);
    await page
      .getByText('Justificación registrada, pendiente de resolución.', {
        exact: true,
      })
      .waitFor();
    return (await result.json()) as Absence;
  }
  async function transition(
    g: AttendanceFixtureGroup,
    student: AttendanceFixtureStudent,
    id: string,
    state: 'APROBADA' | 'RECHAZADA' | 'RECUPERADA' | 'NO_RECUPERADA',
    note: string,
  ) {
    const recovery = state === 'RECUPERADA' || state === 'NO_RECUPERADA';
    const title = recovery
      ? 'Confirmar recuperación'
      : 'Resolver justificación';
    await row(student)
      .getByRole('button', { name: title, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await dialog
      .getByLabel(recovery ? 'Resultado de recuperación' : 'Decisión', {
        exact: true,
      })
      .selectOption(state);
    await dialog
      .getByLabel(
        recovery ? 'Observación de recuperación' : 'Observación de resolución',
        { exact: true },
      )
      .fill(note);
    await dialog
      .getByRole('button', {
        name: recovery ? 'Revisar recuperación' : 'Revisar resolución',
        exact: true,
      })
      .click();
    const written = response(
      `${endpoint(g)}/${id}/${recovery ? 'recuperacion' : 'resolucion'}`,
      'PATCH',
    );
    const listed = response(endpoint(g));
    await dialog
      .getByRole('button', {
        name: recovery ? 'Confirmar recuperación' : 'Confirmar resolución',
        exact: true,
      })
      .click();
    const result = await written;
    expect(result.status()).toBe(200);
    expect((await listed).status()).toBe(200);
    await page
      .getByText(
        recovery ? 'Recuperación registrada.' : 'Resolución registrada.',
        { exact: true },
      )
      .waitFor();
    return (await result.json()) as Absence;
  }
  async function createWithApi(g: AttendanceFixtureGroup, id: string) {
    const result = await apiWrite('secretaria', endpoint(g), 'POST', {
      asistenciaId: id,
      asistenciaVersion: 1,
      motivo: 'Solicitud sintética preparada por API',
      fechaPresentacion: fixture.today,
    });
    expect(result.status()).toBe(201);
    return (await result.json()) as Absence;
  }
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  }

  it('secretaría registra y aprueba; docente recupera sin cambiar J y reduce 40 % a 30 %', async () => {
    const f = await absence();
    await login();
    await open(f.group);
    await contains(row(f.student), 'Sin solicitud');
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    const created = await register(
      f.group,
      f.student,
      'Justificación sintética para recuperar la clase',
    );
    expect(created.justificacion).toMatchObject({
      estado: 'PENDIENTE',
      version: 1,
      registrado_por: fixture.userIds.secretaria,
    });
    const id = created.justificacion!.id;
    expect(
      (
        await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
          f.attendanceId,
        ])
      )[0].codigo,
    ).toBe('J');
    const approved = await transition(
      f.group,
      f.student,
      id,
      'APROBADA',
      'Procede recuperación sintética',
    );
    expect(approved.resumenAsistencia).toMatchObject({
      estado: 'PROVISIONAL',
      inasistenciaPct: '40.00',
      condicion: null,
    });
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    expect(
      await row(f.student)
        .getByRole('button', { name: 'Confirmar recuperación', exact: true })
        .count(),
    ).toBe(0);
    await login('docente');
    await open(f.group);
    const recovered = await transition(
      f.group,
      f.student,
      id,
      'RECUPERADA',
      'Recuperación sintética cumplida',
    );
    expect(recovered.justificacion).toMatchObject({
      estado: 'RECUPERADA',
      version: 3,
      registrado_por: fixture.userIds.secretaria,
      resuelto_por: fixture.userIds.secretaria,
      recuperacion_confirmada_por: fixture.userIds.docente,
    });
    expect(recovered.resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      justificadasRecuperadas: 1,
      justificadasPendientes: 0,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      condicion: 'DENTRO_LIMITE',
    });
    await contains(summary(f.student), 'Inasistencia: 30,00 %');
    await contains(summary(f.student), 'Dentro del límite de asistencia');
    const detailRead = response(`${endpoint(f.group)}/${id}`);
    await row(f.student)
      .getByRole('button', { name: 'Ver detalle', exact: true })
      .click();
    const detail = (await (await detailRead).json()) as Absence & {
      historial: {
        nombre_usuario: string;
        estado_nuevo: string;
        ocurrido_at: string;
      }[];
    };
    expect(
      detail.historial.map((event) => [
        event.nombre_usuario,
        event.estado_nuevo,
      ]),
    ).toEqual([
      ['secretaria', 'PENDIENTE'],
      ['secretaria', 'APROBADA'],
      ['docente', 'RECUPERADA'],
    ]);
    expect(
      detail.historial.every((event) =>
        Number.isFinite(Date.parse(event.ocurrido_at)),
      ),
    ).toBe(true);
    const dialog = page.getByRole('dialog', {
      name: 'Detalle de justificación',
      exact: true,
    });
    const saved = dialog.getByRole('region', {
      name: 'Solicitud registrada',
      exact: true,
    });
    await fact(saved, 'Registrada por', 'secretaria');
    await fact(saved, 'Resuelta por', 'secretaria');
    await fact(saved, 'Recuperación confirmada por', 'docente');
    await fact(
      saved,
      'Observación de resolución',
      'Procede recuperación sintética',
    );
    await fact(
      saved,
      'Observación de recuperación',
      'Recuperación sintética cumplida',
    );
    await dialog
      .getByText('Ver historial de decisiones', { exact: true })
      .click();
    const audit = dialog.getByRole('table', {
      name: 'Historial de justificación',
      exact: true,
    });
    expect(await audit.locator('tbody tr').count()).toBe(3);
    await contains(audit, 'Aprobada → Recuperada');
    await screenshot('justificacion-recuperada-contexto');
    await audit.scrollIntoViewIfNeeded();
    await screenshot('justificacion-recuperada-historial');
    await dialog
      .getByRole('button', { name: 'Cerrar formulario', exact: true })
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
    await screenshot('justificaciones-movil');
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
    expect(
      (
        await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
          f.attendanceId,
        ])
      )[0].codigo,
    ).toBe('J');
  });

  it.each(['RECHAZADA', 'NO_RECUPERADA'] as const)(
    '%s mantiene la falta computable y conserva la decisión terminal',
    async (state) => {
      const f = await absence();
      await login();
      await open(f.group);
      const created = await register(f.group, f.student);
      const id = created.justificacion!.id;
      let result: Absence;
      if (state === 'RECHAZADA')
        result = await transition(
          f.group,
          f.student,
          id,
          state,
          'Rechazo sintético motivado',
        );
      else {
        await transition(
          f.group,
          f.student,
          id,
          'APROBADA',
          'Recuperación sintética autorizada',
        );
        await login('admin_b14_web');
        await open(f.group);
        result = await transition(
          f.group,
          f.student,
          id,
          state,
          'No cumplió la recuperación sintética',
        );
      }
      expect(result.justificacion).toMatchObject({ estado: state });
      expect(result.resumenAsistencia).toMatchObject({
        estado: 'CALCULADO',
        faltasComputables: 4,
        faltasConfirmadas: 4,
        inasistenciaPct: '40.00',
        condicion: 'RETIRADO_INASISTENCIA',
      });
      await contains(summary(f.student), 'Retirado por inasistencia');
      expect(
        await row(f.student)
          .getByRole('button', {
            name: /Registrar justificación|Resolver justificación|Confirmar recuperación/,
          })
          .count(),
      ).toBe(0);
      expect(
        (
          await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
            f.attendanceId,
          ])
        )[0].codigo,
      ).toBe('J');
    },
  );

  it('docente ajeno recibe 403 y coordinación consulta sin controles de escritura', async () => {
    const f = await absence(['J'], false);
    await createWithApi(f.group, f.attendanceId);
    await login('ajeno');
    const denied = response(endpoint(f.group));
    await page.goto(`${origin}/#${route(f.group)}`);
    expect((await denied).status()).toBe(403);
    await contains(
      page.getByRole('alert'),
      'No tienes permiso para esta acción.',
    );
    expect(await table().count()).toBe(0);
    await login('coordinador');
    await open(f.group);
    await contains(row(f.student), 'Solo lectura');
    expect(
      await table()
        .getByRole('button', {
          name: /Registrar justificación|Resolver justificación|Confirmar recuperación/,
        })
        .count(),
    ).toBe(0);
    await row(f.student)
      .getByRole('button', { name: 'Ver detalle', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Detalle de justificación', exact: true })
      .waitFor();
  });

  it('un conflicto conserva la resolución capturada y exige recarga con descarte explícito', async () => {
    const f = await absence();
    const created = await createWithApi(f.group, f.attendanceId);
    const id = created.justificacion!.id;
    await login();
    await open(f.group);
    await row(f.student)
      .getByRole('button', { name: 'Resolver justificación', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Resolver justificación',
      exact: true,
    });
    await dialog
      .getByLabel('Decisión', { exact: true })
      .selectOption('RECHAZADA');
    await dialog
      .getByLabel('Observación de resolución', { exact: true })
      .fill('Captura sintética que debe conservarse');
    const concurrent = await apiWrite(
      'admin_b14_web',
      `${endpoint(f.group)}/${id}/resolucion`,
      'PATCH',
      {
        estado: 'APROBADA',
        version: 1,
        observacion: 'Aprobación concurrente sintética',
      },
    );
    expect(concurrent.status()).toBe(200);
    await dialog
      .getByRole('button', { name: 'Revisar resolución', exact: true })
      .click();
    const failed = response(`${endpoint(f.group)}/${id}/resolucion`, 'PATCH');
    await dialog
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    expect((await failed).status()).toBe(409);
    await contains(dialog.getByRole('alert'), 'La justificación cambió');
    expect(
      await dialog.getByLabel('Decisión', { exact: true }).inputValue(),
    ).toBe('RECHAZADA');
    expect(
      await dialog
        .getByLabel('Observación de resolución', { exact: true })
        .inputValue(),
    ).toBe('Captura sintética que debe conservarse');
    expect(
      await dialog.getByLabel('Decisión', { exact: true }).isDisabled(),
    ).toBe(true);
    await contains(summary(f.student), 'Resumen no actualizado');
    await screenshot('justificacion-conflicto');
    await dialog
      .getByRole('button', { name: 'Recargar justificación', exact: true })
      .click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await dialog
        .getByLabel('Observación de resolución', { exact: true })
        .inputValue(),
    ).toBe('Captura sintética que debe conservarse');
    await dialog
      .getByRole('button', { name: 'Recargar justificación', exact: true })
      .click();
    const listed = response(endpoint(f.group));
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await listed).status()).toBe(200);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    await contains(row(f.student), 'Aprobada');
    expect(
      (
        await source.query(
          'SELECT estado,version,observacion_resolucion FROM justificaciones WHERE id=$1',
          [id],
        )
      )[0],
    ).toMatchObject({
      estado: 'APROBADA',
      version: 2,
      observacion_resolucion: 'Aprobación concurrente sintética',
    });
  });

  it('una decisión guardada con fallo del listado oculta resúmenes y bloquea nuevas decisiones hasta recargar', async () => {
    const f = await absence();
    const created = await createWithApi(f.group, f.attendanceId);
    const id = created.justificacion!.id;
    await login('admin_b14_web');
    await open(f.group);
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    await row(f.student)
      .getByRole('button', { name: 'Resolver justificación', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Resolver justificación',
      exact: true,
    });
    await dialog
      .getByLabel('Decisión', { exact: true })
      .selectOption('APROBADA');
    await dialog
      .getByLabel('Observación de resolución', { exact: true })
      .fill('Decisión sintética persistida antes del fallo de consulta');
    await dialog
      .getByRole('button', { name: 'Revisar resolución', exact: true })
      .click();
    let failedReads = 0;
    await page.route(
      (url) => url.pathname === endpoint(f.group),
      async (intercept) => {
        if (intercept.request().method() === 'GET' && failedReads === 0) {
          failedReads++;
          await intercept.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Fallo sintético del listado B14',
            }),
          });
        } else await intercept.continue();
      },
    );
    const written = response(`${endpoint(f.group)}/${id}/resolucion`, 'PATCH');
    const failed = response(endpoint(f.group));
    await dialog
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    expect((await written).status()).toBe(200);
    expect((await failed).status()).toBe(500);
    await page.getByText('Resolución registrada.', { exact: true }).waitFor();
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    await page.getByText(/No se pudo actualizar el listado\./).waitFor();
    await contains(row(f.student), 'Aprobada');
    await contains(summary(f.student), 'Resumen no actualizado');
    expect(await summary(f.student).textContent()).not.toContain('40,00 %');
    expect(await summary(f.student).textContent()).not.toContain(
      'Faltas computables:',
    );
    const recover = row(f.student).getByRole('button', {
      name: 'Confirmar recuperación',
      exact: true,
    });
    expect(await recover.isDisabled()).toBe(true);
    expect(
      (
        await source.query(
          'SELECT estado,version,observacion_resolucion FROM justificaciones WHERE id=$1',
          [id],
        )
      )[0],
    ).toMatchObject({
      estado: 'APROBADA',
      version: 2,
      observacion_resolucion:
        'Decisión sintética persistida antes del fallo de consulta',
    });
    expect(failedReads).toBe(1);
    const listed = response(endpoint(f.group));
    await page
      .getByRole('button', { name: 'Recargar justificaciones', exact: true })
      .click();
    expect((await listed).status()).toBe(200);
    await contains(summary(f.student), 'Inasistencia: 40,00 %');
    expect(await summary(f.student).textContent()).not.toContain(
      'Resumen no actualizado',
    );
    expect(await recover.isEnabled()).toBe(true);
    expect(
      await page.getByText(/No se pudo actualizar el listado\./).count(),
    ).toBe(0);
    expect(failedReads).toBe(1);
  });

  it('errores de validación o servicio conservan la solicitud y Escape protege los cambios', async () => {
    const f = await absence(['J']);
    await login();
    await open(f.group);
    await row(f.student)
      .getByRole('button', { name: 'Registrar justificación', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Registrar justificación',
      exact: true,
    });
    await dialog
      .getByRole('button', { name: 'Revisar solicitud', exact: true })
      .click();
    await contains(dialog, 'Indica el motivo de la justificación.');
    await dialog
      .getByLabel('Motivo', { exact: true })
      .fill('Solicitud sintética conservada tras error');
    await page.keyboard.press('Escape');
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await dialog.getByLabel('Motivo', { exact: true }).inputValue(),
    ).toBe('Solicitud sintética conservada tras error');
    const pattern = `**${endpoint(f.group)}`;
    await page.route(pattern, async (intercept) => {
      if (intercept.request().method() === 'POST')
        await intercept.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Fallo sintético B14' }),
        });
      else await intercept.continue();
    });
    await dialog
      .getByRole('button', { name: 'Revisar solicitud', exact: true })
      .click();
    expect(
      await source.query(
        'SELECT id FROM justificaciones WHERE asistencia_id=$1',
        [f.attendanceId],
      ),
    ).toEqual([]);
    const failed = response(endpoint(f.group), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar solicitud', exact: true })
      .click();
    expect((await failed).status()).toBe(503);
    await contains(
      dialog.getByRole('alert'),
      'El servicio no pudo completar la operación.',
    );
    expect(
      await dialog.getByLabel('Motivo', { exact: true }).inputValue(),
    ).toBe('Solicitud sintética conservada tras error');
    expect(
      await dialog.getByLabel('Motivo', { exact: true }).isDisabled(),
    ).toBe(false);
    await page.unroute(pattern);
    await dialog
      .getByRole('button', { name: 'Revisar solicitud', exact: true })
      .click();
    const written = response(endpoint(f.group), 'POST');
    const listed = response(endpoint(f.group));
    await dialog
      .getByRole('button', { name: 'Confirmar solicitud', exact: true })
      .click();
    expect((await written).status()).toBe(201);
    expect((await listed).status()).toBe(200);
    expect(
      await source.query(
        'SELECT motivo FROM justificaciones WHERE asistencia_id=$1',
        [f.attendanceId],
      ),
    ).toEqual([{ motivo: 'Solicitud sintética conservada tras error' }]);
  });

  it('pagina 20/21 marcas J y filtra solicitudes aprobadas o ausencias sin solicitud', async () => {
    const group = await fixture.group();
    const s = await fixture.session(group, 'REALIZADA');
    const students = [];
    const attendanceIds = [];
    for (let index = 0; index < 21; index++) {
      const student = await fixture.student();
      const enrollment = await fixture.enroll(group, student);
      students.push(student);
      attendanceIds.push(await seedMark(s, enrollment, 'J'));
    }
    const created = await createWithApi(group, attendanceIds[0]!);
    const approved = await apiWrite(
      'secretaria',
      `${endpoint(group)}/${created.justificacion!.id}/resolucion`,
      'PATCH',
      {
        estado: 'APROBADA',
        version: 1,
        observacion: 'Aprobación sintética para filtro',
      },
    );
    expect(approved.status()).toBe(200);
    await login();
    await open(group);
    expect(await table().locator('tbody tr').count()).toBe(20);
    const secondRead = response(endpoint(group));
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    expect((await secondRead).status()).toBe(200);
    await expect.poll(() => table().locator('tbody tr').count()).toBe(1);
    await row(students[20]!).waitFor();
    await page
      .getByLabel('Estado de solicitud', { exact: true })
      .selectOption('APROBADA');
    const filtered = response(endpoint(group));
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    expect((await filtered).status()).toBe(200);
    await expect.poll(() => table().locator('tbody tr').count()).toBe(1);
    await row(students[0]!).waitFor();
    expect(new URL(page.url()).hash).toContain('estado=APROBADA');
    expect(new URL(page.url()).hash).not.toContain('after=');
    await page
      .getByLabel('Estado de solicitud', { exact: true })
      .selectOption('SIN_SOLICITUD');
    const missing = response(endpoint(group));
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    expect((await missing).status()).toBe(200);
    await expect.poll(() => table().locator('tbody tr').count()).toBe(20);
    expect(await row(students[0]!).count()).toBe(0);
    await page
      .getByLabel('Estudiante, documento o matrícula', { exact: true })
      .fill(students[20]!.documento);
    const searched = response(endpoint(group));
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    expect((await searched).status()).toBe(200);
    await expect.poll(() => table().locator('tbody tr').count()).toBe(1);
    await row(students[20]!).waitFor();
  });

  it('la matriz conserva J con expediente, permite su observación y protege captura al gestionar', async () => {
    const f = await absence(['J']);
    const other = await fixture.student();
    const enrollment = await fixture.enroll(f.group, other);
    await seedMark(f.session, enrollment, 'F');
    const created = await createWithApi(f.group, f.attendanceId);
    await login('docente');
    const matrixEndpoint = `/api/v1/asistencia/grupos/${f.group.id}/sesiones/${f.session.id}/asistencias`;
    const loaded = response(matrixEndpoint);
    await page.goto(
      `${origin}/#/asistencia/grupos/${f.group.id}/sesiones/${f.session.id}`,
    );
    expect((await loaded).status()).toBe(200);
    const marked = page.getByLabel(`Asistencia de ${f.student.nombre}`, {
      exact: true,
    });
    expect(await marked.isDisabled()).toBe(true);
    expect(await marked.inputValue()).toBe('J');
    const note = page.getByLabel(`Observación de ${f.student.nombre}`, {
      exact: true,
    });
    await note.fill('Observación docente sintética preservando expediente');
    await page
      .getByRole('link', { name: 'Gestionar justificación', exact: true })
      .click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await note.inputValue()).toBe(
      'Observación docente sintética preservando expediente',
    );
    await page
      .getByRole('button', { name: 'Marcar presentes', exact: true })
      .click();
    expect(await marked.inputValue()).toBe('J');
    expect(
      await page
        .getByLabel(`Asistencia de ${other.nombre}`, { exact: true })
        .inputValue(),
    ).toBe('P');
    const written = response(matrixEndpoint, 'PATCH');
    const refreshed = response(matrixEndpoint);
    await page
      .getByRole('button', { name: 'Guardar asistencia', exact: true })
      .click();
    expect((await written).status()).toBe(200);
    expect((await refreshed).status()).toBe(200);
    expect(
      (
        await source.query(
          'SELECT codigo,observacion,version FROM asistencias WHERE id=$1',
          [f.attendanceId],
        )
      )[0],
    ).toMatchObject({
      codigo: 'J',
      observacion: 'Observación docente sintética preservando expediente',
      version: 2,
    });
    expect(
      (
        await source.query(
          'SELECT estado,version FROM justificaciones WHERE id=$1',
          [created.justificacion!.id],
        )
      )[0],
    ).toMatchObject({ estado: 'PENDIENTE', version: 1 });
    const list = response(endpoint(f.group));
    await page
      .getByRole('link', { name: 'Gestionar justificación', exact: true })
      .click();
    expect((await list).status()).toBe(200);
    await table().waitFor();
    expect(new URL(page.url()).hash).toContain(`q=${f.student.documento}`);
  });
});
