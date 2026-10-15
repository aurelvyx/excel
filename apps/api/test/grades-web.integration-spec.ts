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
import {
  createWebServer,
  freePort,
  type ViteServer,
} from './browser-server.js';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureGroup,
  type AttendanceFixtureStudent,
  type AttendanceFixtureEnrollment,
} from './attendance.fixture.js';
import type { EvaluationDefinition } from '../src/modules/evaluacion/evaluation.policy.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B17 con pnpm test:db');
const password = 'Sintetica-B17-navegador';
const adminName = 'admin_b17_web';
const artifacts = fileURLToPath(new URL('../../../.tmp/b17/', import.meta.url));

describe('B17 navegador React → API → PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let english: string;
  let portuguese: string;
  let sequence = 0;
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
      await base.query('CREATE DATABASE excel_grades_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_grades_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(source, adminName, password);
    adminId = admin.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    fixture = await attendanceFixture(source, adminId, password);
    const levels = await source.query(
      "SELECT n.id,i.codigo FROM niveles n JOIN idiomas i ON i.id=n.idioma_id WHERE n.codigo='DEMO-1'",
    );
    english = levels.find((row: { codigo: string }) => row.codigo === 'DEMO-EN')
      .id as string;
    portuguese = levels.find(
      (row: { codigo: string }) => row.codigo === 'DEMO-PT',
    ).id as string;
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
  function response(pathname: string, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === pathname &&
        res.request().method() === method,
    );
  }
  async function login(name = 'docente') {
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
    path: string,
    method: 'POST' | 'PATCH',
    data: unknown,
    name = adminName,
  ) {
    const actor = await apiActor(name);
    return actor.context.request.fetch(`${origin}/api/v1/${path}`, {
      method,
      data,
      headers: {
        Origin: origin,
        'X-Requested-With': 'Excel-Web',
        'X-CSRF-Token': actor.csrf,
      },
    });
  }
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}${name}.png`, fullPage: true });
  }
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
  const single = (): EvaluationDefinition => ({
    evaluaciones: [
      {
        nombre: 'Evaluación sintética',
        unidadId: null,
        pesoPct: '100',
        orden: 1,
        indicadores: [
          {
            codigo: 'SYN-A',
            descripcion: 'Criterio sintético A',
            pesoPct: '100',
            orden: 1,
          },
        ],
      },
    ],
  });
  const two = (): EvaluationDefinition => ({
    evaluaciones: [
      {
        nombre: 'Evaluación sintética',
        unidadId: null,
        pesoPct: '100',
        orden: 1,
        indicadores: [
          {
            codigo: 'SYN-A',
            descripcion: 'Criterio sintético A',
            pesoPct: '50',
            orden: 1,
          },
          {
            codigo: 'SYN-B',
            descripcion: 'Criterio sintético B',
            pesoPct: '50',
            orden: 2,
          },
        ],
      },
    ],
  });
  const hierarchical = (): EvaluationDefinition => ({
    evaluaciones: [
      {
        nombre: 'Componente sintético uno',
        unidadId: null,
        pesoPct: '40',
        orden: 1,
        indicadores: [
          {
            codigo: 'SYN-A',
            descripcion: 'Criterio sintético A',
            pesoPct: '25',
            orden: 1,
          },
          {
            codigo: 'SYN-B',
            descripcion: 'Criterio sintético B',
            pesoPct: '75',
            orden: 2,
          },
        ],
      },
      {
        nombre: 'Componente sintético dos',
        unidadId: null,
        pesoPct: '60',
        orden: 2,
        indicadores: [
          {
            codigo: 'SYN-C',
            descripcion: 'Criterio sintético C',
            pesoPct: '100',
            orden: 1,
          },
        ],
      },
    ],
  });
  type Matrix = {
    group: AttendanceFixtureGroup;
    students: AttendanceFixtureStudent[];
    enrollments: AttendanceFixtureEnrollment[];
    indicators: { id: string; codigo: string; evaluacion_id: string }[];
    planId: string;
  };
  async function matrix(
    count = 1,
    definition = single(),
    level = english,
  ): Promise<Matrix> {
    const group = await fixture.group();
    if (level !== group.nivel_id) {
      await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
        group.id,
        level,
      ]);
      group.nivel_id = level;
    }
    const students: AttendanceFixtureStudent[] = [];
    const enrollments: AttendanceFixtureEnrollment[] = [];
    for (let index = 0; index < count; index++) {
      const student = await fixture.student();
      students.push(student);
      enrollments.push(await fixture.enroll(group, student));
    }
    const created = await apiWrite(
      `evaluacion/niveles/${level}/planes`,
      'POST',
      {
        nombre: `Plan sintético B17 ${++sequence}`,
        formula: 'PONDERADA_JERARQUICA_V1',
        estructura: definition,
      },
    );
    expect(created.status()).toBe(201);
    const { plan } = await created.json();
    const approved = await apiWrite(
      `evaluacion/planes/${plan.id}/aprobacion`,
      'POST',
      {
        revision: plan.revision,
        referenciaAprobacion:
          'Referencia sintética; no aprobación institucional',
        confirmado: true,
      },
    );
    expect(approved.status()).toBe(201);
    const applied = await apiWrite(
      `evaluacion/grupos/${group.id}/configuracion`,
      'POST',
      { planId: plan.id, confirmado: true },
    );
    expect(applied.status()).toBe(201);
    const indicators = await source.query(
      'SELECT i.id,i.codigo,i.evaluacion_id FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.grupo_id=$1 ORDER BY e.orden,i.orden',
      [group.id],
    );
    return {
      group,
      students,
      enrollments,
      indicators,
      planId: plan.id as string,
    };
  }
  const endpoint = (g: AttendanceFixtureGroup) =>
    `/api/v1/evaluacion/grupos/${g.id}/calificaciones`;
  async function open(g: AttendanceFixtureGroup, status = 200) {
    const loaded = response(endpoint(g));
    await page.goto(`${origin}/#/evaluacion/grupos/${g.id}/calificaciones`);
    expect((await loaded).status()).toBe(status);
    await page
      .getByRole('heading', { name: 'Registro de calificaciones', exact: true })
      .waitFor();
  }
  const grade = (owner: AttendanceFixtureStudent, code = 'SYN-A') =>
    page.getByLabel(`Nota ${code} de ${owner.nombre}`, { exact: true });
  const summary = (owner: AttendanceFixtureStudent) =>
    page.getByRole('region', {
      name: `Resumen de notas de ${owner.nombre}`,
      exact: true,
    });
  const save = () =>
    page
      .getByRole('button', { name: 'Guardar calificaciones', exact: true })
      .click();
  async function saveSuccess(g: AttendanceFixtureGroup) {
    const saved = response(endpoint(g), 'PATCH');
    await save();
    expect((await saved).status()).toBe(200);
    await page
      .getByText('Calificaciones guardadas.', { exact: true })
      .waitFor();
    await expect
      .poll(() =>
        page
          .getByRole('button', { name: 'Guardar calificaciones', exact: true })
          .getAttribute('aria-busy'),
      )
      .toBe(null);
  }
  async function persisted(g: AttendanceFixtureGroup) {
    return source.query(
      'SELECT matricula_id,indicador_id,nota,version,registrado_por FROM calificaciones WHERE grupo_id=$1 ORDER BY matricula_id,indicador_id',
      [g.id],
    );
  }
  async function externalSave(
    f: Matrix,
    index: number,
    nota: string,
    version: number | null = null,
  ) {
    const changed = await apiWrite(
      `evaluacion/grupos/${f.group.id}/calificaciones`,
      'PATCH',
      {
        registros: [
          {
            matriculaId: f.enrollments[index]!.id,
            indicadorId: f.indicators[0]!.id,
            nota,
            version,
          },
        ],
      },
      'docente2',
    );
    expect(changed.status()).toBe(200);
  }
  async function discardReload() {
    await page
      .getByRole('button', { name: 'Recargar calificaciones', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  /** Fixture de acta histórica; B18 todavía no expone el flujo de cierre. */
  async function historicalAct(g: AttendanceFixtureGroup) {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(
        'ALTER TABLE cierres_academicos DISABLE TRIGGER cierres_asistencia_registro',
      );
      await runner.query(
        "INSERT INTO cierres_academicos(grupo_id,tipo,estado,realizado_por,revision,resumen) VALUES($1,'ACTA','CERRADO',$2,$3,'{}')",
        [g.id, adminId, 'a'.repeat(64)],
      );
      await runner.query(
        'ALTER TABLE cierres_academicos ENABLE TRIGGER cierres_asistencia_registro',
      );
      await runner.commitTransaction();
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  }

  it('captura por evaluación conserva notas y calcula 12.4→12 y 12.5→13 con pesos jerárquicos aprobados', async () => {
    const f = await matrix(2, hierarchical());
    await login();
    await page.goto(`${origin}/#/asistencia/grupos/${f.group.id}`);
    await page
      .getByRole('link', { name: 'Calificaciones', exact: true })
      .click();
    await grade(f.students[0]!).waitFor();
    for (const [index, note] of ['10', '11'].entries()) {
      expect(await grade(f.students[index]!).inputValue()).toBe('');
      await grade(f.students[index]!).fill(note);
      await grade(f.students[index]!, 'SYN-B').fill('14,00');
    }
    await page
      .getByLabel('Evaluación', { exact: true })
      .selectOption(f.indicators[2]!.evaluacion_id);
    for (const student of f.students)
      await grade(student, 'SYN-C').fill('12.00');
    await page
      .getByLabel('Evaluación', { exact: true })
      .selectOption(f.indicators[0]!.evaluacion_id);
    expect(await grade(f.students[0]!).inputValue()).toBe('10');
    expect(await persisted(f.group)).toEqual([]);
    await fact(summary(f.students[0]!), 'Promedio', 'Pendiente');
    await saveSuccess(f.group);
    await fact(summary(f.students[0]!), 'Promedio', '12,40');
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '12');
    await fact(summary(f.students[1]!), 'Promedio', '12,50');
    await fact(summary(f.students[1]!), 'Nota oficial calculada', '13');
    expect(await persisted(f.group)).toHaveLength(6);
    expect(
      (await persisted(f.group)).every(
        (r: { version: number; registrado_por: string }) =>
          r.version === 1 && r.registrado_por === fixture.userIds.docente,
      ),
    ).toBe(true);
    await screenshot('notas-ingles-escritorio');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const scroll = page.getByRole('region', {
      name: 'Tabla de calificaciones del grupo',
      exact: true,
    });
    expect(await scroll.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      true,
    );
    await screenshot('notas-ingles-movil');
  });

  it('el cero registrado se distingue de las notas pendientes y no crea un resultado académico', async () => {
    const f = await matrix(2);
    await login();
    await open(f.group);
    await grade(f.students[0]!).fill('0');
    await saveSuccess(f.group);
    await fact(summary(f.students[0]!), 'Promedio', '0,00');
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '0');
    await fact(summary(f.students[1]!), 'Promedio', 'Pendiente');
    await fact(summary(f.students[1]!), 'Notas pendientes', '1');
    expect(await grade(f.students[1]!).inputValue()).toBe('');
    expect((await persisted(f.group))[0].nota).toBe('0.00');
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[])',
        [f.enrollments.map((e) => e.id)],
      ),
    ).toEqual([]);
  });

  it('muestra 12.495 exacto, actualiza a 12.50 y conserva notas anteriores en historial y ficha del intento', async () => {
    const f = await matrix(1, two());
    await login();
    await open(f.group);
    await grade(f.students[0]!).fill('12,49');
    await grade(f.students[0]!, 'SYN-B').fill('12,50');
    await saveSuccess(f.group);
    await fact(summary(f.students[0]!), 'Promedio', '12,495');
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '12');
    await grade(f.students[0]!).fill('12,50');
    await saveSuccess(f.group);
    await fact(summary(f.students[0]!), 'Promedio', '12,50');
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '13');
    await page
      .getByRole('button', {
        name: `Historial de SYN-A de ${f.students[0]!.nombre}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Historial de calificación',
      exact: true,
    });
    const history = dialog.getByRole('table', {
      name: 'Historial de calificación',
      exact: true,
    });
    await contains(history, 'Actualización de nota');
    await contains(history, '12,49');
    await contains(history, '12,50');
    await screenshot('notas-historial');
    await page.keyboard.press('Escape');
    await login(adminName);
    await page.goto(`${origin}/#/estudiantes/${f.students[0]!.id}`);
    await fact(
      page.getByRole('region', {
        name: 'Resumen de notas del intento 1',
        exact: true,
      }),
      'Promedio',
      '12,50',
    );
    await page
      .getByRole('button', { name: 'Consultar intento 1', exact: true })
      .click();
    await fact(
      page.getByRole('region', {
        name: 'Notas guardadas del intento',
        exact: true,
      }),
      'Nota oficial calculada',
      '13',
    );
  });

  it('valida rangos y precisión sin enviar ni perder captura; una nota registrada no se borra al dejarla vacía', async () => {
    const f = await matrix();
    await login();
    await open(f.group);
    let writes = 0;
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === endpoint(f.group) &&
        request.method() === 'PATCH'
      )
        writes++;
    });
    const input = grade(f.students[0]!);
    for (const value of ['-1', '20,01', '21', '1e1', '12.345', 'abc']) {
      await input.fill(value);
      await save();
      await expect.poll(() => input.getAttribute('aria-invalid')).toBe('true');
      expect(await input.inputValue()).toBe(value);
      // El error puede renderizarse antes de que el formulario enfoque el campo.
      await expect
        .poll(() =>
          input.evaluate((element) => element === document.activeElement),
        )
        .toBe(true);
    }
    expect(writes).toBe(0);
    expect(await persisted(f.group)).toEqual([]);
    await input.fill('20');
    await saveSuccess(f.group);
    expect(writes).toBe(1);
    await input.fill('');
    await save();
    await contains(
      page.getByRole('main'),
      'una nota registrada no puede quedar vacía',
    );
    expect(writes).toBe(1);
    expect((await persisted(f.group))[0].nota).toBe('20.00');
  });

  it('un conflicto conserva captura, oculta cálculo anterior y exige descarte explícito para recargar', async () => {
    const f = await matrix();
    await login();
    await open(f.group);
    await grade(f.students[0]!).fill('11,25');
    await externalSave(f, 0, '16');
    const conflicted = response(endpoint(f.group), 'PATCH');
    await save();
    expect((await conflicted).status()).toBe(409);
    await expect.poll(() => grade(f.students[0]!).isDisabled()).toBe(true);
    expect(await grade(f.students[0]!).inputValue()).toBe('11,25');
    expect(
      await page
        .getByRole('button', { name: 'Guardar calificaciones', exact: true })
        .isDisabled(),
    ).toBe(true);
    await contains(summary(f.students[0]!), 'Recarga las calificaciones');
    expect(
      await summary(f.students[0]!)
        .getByText('Nota oficial calculada', { exact: true })
        .count(),
    ).toBe(0);
    await screenshot('notas-conflicto');
    await page
      .getByRole('button', { name: 'Recargar calificaciones', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await grade(f.students[0]!).inputValue()).toBe('11,25');
    await discardReload();
    await expect.poll(() => grade(f.students[0]!).inputValue()).toBe('16,00');
    expect(await grade(f.students[0]!).isDisabled()).toBe(false);
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '16');
  });

  it('un fallo de envío permite reintentar y una falla de reconsulta oculta el resumen hasta recarga', async () => {
    const f = await matrix();
    await login();
    await open(f.group);
    await grade(f.students[0]!).fill('13,50');
    let mode = 'write';
    await page.route(`**${endpoint(f.group)}*`, async (route) => {
      if (
        (mode === 'write' && route.request().method() === 'PATCH') ||
        (mode === 'read' && route.request().method() === 'GET')
      ) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Fallo sintético' }),
        });
      } else await route.continue();
    });
    const failed = response(endpoint(f.group), 'PATCH');
    await save();
    expect((await failed).status()).toBe(503);
    await page.getByRole('alert').waitFor();
    expect(await grade(f.students[0]!).inputValue()).toBe('13,50');
    expect(await persisted(f.group)).toEqual([]);
    mode = 'read';
    await saveSuccess(f.group);
    await contains(summary(f.students[0]!), 'Recarga las calificaciones');
    await contains(
      page.getByRole('main'),
      'Las notas se guardaron, pero no se pudo actualizar el cálculo',
    );
    expect((await persisted(f.group))[0].nota).toBe('13.50');
    expect(
      await page
        .getByRole('region', {
          name: 'Pendientes de calificación',
          exact: true,
        })
        .count(),
    ).toBe(0);
    await page.unroute(`**${endpoint(f.group)}*`);
    await page
      .getByRole('button', { name: 'Recargar calificaciones', exact: true })
      .click();
    await fact(summary(f.students[0]!), 'Promedio', '13,50');
    expect(await persisted(f.group)).toHaveLength(1);
  });

  it('la paginación y navegación por hash y cierre de sesión respetan las notas pendientes de guardar', async () => {
    const f = await matrix(21);
    await login();
    await open(f.group);
    await grade(f.students[0]!).fill('15');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(page.url()).not.toContain('after=');
    expect(await grade(f.students[0]!).inputValue()).toBe('15');
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .waitFor();
    expect(page.url()).toContain(
      `/evaluacion/grupos/${f.group.id}/calificaciones`,
    );
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await grade(f.students[0]!).inputValue()).toBe('15');
    await saveSuccess(f.group);
    expect(await persisted(f.group)).toHaveLength(1);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await grade(f.students[20]!).waitFor();
    expect(await grade(f.students[20]!).inputValue()).toBe('');
    await grade(f.students[20]!).fill('10');
    await page
      .getByRole('button', { name: 'Primera página', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await expect.poll(() => grade(f.students[0]!).inputValue()).toBe('15,00');
    expect(await persisted(f.group)).toHaveLength(1);
  }, 60000);

  it('administración, secretaría y coordinación consultan sin editar; docente ajeno no accede al padrón', async () => {
    const f = await matrix();
    await externalSave(f, 0, '14');
    for (const name of [adminName, 'secretaria', 'coordinador']) {
      await login(name);
      await open(f.group);
      await fact(summary(f.students[0]!), 'Nota oficial calculada', '14');
      await contains(page.getByRole('main'), 'Solo lectura');
      expect(await grade(f.students[0]!).count()).toBe(0);
      expect(
        await page
          .getByRole('button', { name: 'Guardar calificaciones', exact: true })
          .count(),
      ).toBe(0);
    }
    await login('ajeno');
    await open(f.group, 403);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('main').textContent()).not.toContain(
      f.students[0]!.nombre,
    );
    expect(await persisted(f.group)).toHaveLength(1);
  });

  it('acta, grupo o periodo cerrado se consulta sin captura y sin modificar las notas', async () => {
    for (const closed of ['acta', 'grupo', 'periodo']) {
      const f = await matrix();
      await externalSave(f, 0, '12');
      if (closed === 'acta') await historicalAct(f.group);
      else if (closed === 'grupo')
        await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
          f.group.id,
        ]);
      else
        await source.query(
          "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
          [f.group.periodo_id],
        );
      await login();
      await open(f.group);
      await contains(page.getByRole('main'), 'Solo lectura');
      await fact(summary(f.students[0]!), 'Nota oficial calculada', '12');
      expect(await grade(f.students[0]!).count()).toBe(0);
      expect(
        await page
          .getByRole('button', { name: 'Guardar calificaciones', exact: true })
          .count(),
      ).toBe(0);
      if (closed === 'acta')
        await fact(
          page.getByRole('region', {
            name: 'Contexto de calificaciones',
            exact: true,
          }),
          'Estado del acta',
          'Cerrada',
        );
      expect((await persisted(f.group))[0].nota).toBe('12.00');
    }
  });

  it('portugués permite notas con asistencia cerrada y conserva la evidencia de asistencia y del intento', async () => {
    const f = await matrix(1, single(), portuguese);
    const session = await fixture.session(f.group, 'REALIZADA');
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [f.group.id, session.id, f.enrollments[0]!.id, fixture.userIds.docente],
    );
    const actor = await apiActor();
    const loaded = await actor.context.request.get(
      `${origin}/api/v1/asistencia/grupos/${f.group.id}/cierre`,
    );
    expect(loaded.status()).toBe(200);
    const closed = await apiWrite(
      `asistencia/grupos/${f.group.id}/cierre`,
      'POST',
      { revision: (await loaded.json()).revision, confirmarPendientes: false },
    );
    expect(closed.status()).toBe(201);
    const marks = await source.query(
      'SELECT * FROM asistencias WHERE grupo_id=$1',
      [f.group.id],
    );
    await login();
    await open(f.group);
    await contains(
      page.getByRole('region', { name: 'Contexto del grupo', exact: true }),
      'Portugués de prueba',
    );
    await fact(
      page.getByRole('region', { name: 'Contexto del grupo', exact: true }),
      'Estado de asistencia',
      'Cerrada',
    );
    await fact(
      page.getByRole('region', {
        name: 'Contexto de calificaciones',
        exact: true,
      }),
      'Estado del acta',
      'Abierta',
    );
    await grade(f.students[0]!).fill('12,5');
    await saveSuccess(f.group);
    await fact(summary(f.students[0]!), 'Nota oficial calculada', '13');
    expect(
      await source.query('SELECT * FROM asistencias WHERE grupo_id=$1', [
        f.group.id,
      ]),
    ).toEqual(marks);
    await screenshot('notas-portugues-asistencia-cerrada');
  });

  it('una consulta sin criterios aprobados informa el pendiente y una falla inicial se puede reintentar', async () => {
    const g = await fixture.group();
    const student = await fixture.student();
    await fixture.enroll(g, student);
    await login();
    await page.route(`**${endpoint(g)}*`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await open(g, 503);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('main').textContent()).not.toContain(
      student.nombre,
    );
    await page.unroute(`**${endpoint(g)}*`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await contains(page.getByRole('main'), 'Aplica una versión aprobada');
    expect(await grade(student).count()).toBe(0);
    expect(
      await page
        .getByRole('button', { name: 'Guardar calificaciones', exact: true })
        .count(),
    ).toBe(0);
    await fact(summary(student), 'Promedio', 'Pendiente');
    expect(await persisted(g)).toEqual([]);
  });
});
