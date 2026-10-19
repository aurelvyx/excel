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
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B16 con pnpm test:db');
const password = 'Sintetica-B16-navegador';
const adminName = 'admin_b16_web';
const artifacts = fileURLToPath(new URL('../../../.tmp/b16/', import.meta.url));
type Definition = {
  evaluaciones: {
    nombre: string;
    unidadId: string | null;
    pesoPct: string;
    orden: number;
    indicadores: {
      codigo: string;
      descripcion: string;
      pesoPct: string;
      orden: number;
    }[];
  }[];
};
type PlanView = {
  plan: {
    id: string;
    revision: number;
    version: number;
    nombre: string;
    formula: string;
    estado: string;
    estructura: Definition;
  };
  validacion: { completa: boolean; pesoTotalPct: string };
};

describe('B16 navegador React → API → PostgreSQL', () => {
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
  let unit: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  const errors: string[] = [];
  const sessions = new Map<
    string,
    Awaited<ReturnType<BrowserContext['cookies']>>
  >();
  const actors = new Map<string, { context: BrowserContext; csrf: string }>();
  const unique = () => `Criterios sintéticos B16 ${++sequence}`;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_evaluation_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_evaluation_web_test';
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
    [{ id: unit }] = await source.query(
      'SELECT id FROM unidades_didacticas WHERE nivel_id=$1 ORDER BY id LIMIT 1',
      [english],
    );
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
    path: string,
    method: 'POST' | 'PATCH',
    data: unknown,
    name = adminName,
  ) {
    const actor = await apiActor(name);
    return actor.context.request.fetch(`${origin}/api/v1/evaluacion/${path}`, {
      method,
      data,
      headers: {
        Origin: origin,
        'X-Requested-With': 'Excel-Web',
        'X-CSRF-Token': actor.csrf,
      },
    });
  }
  const definition = (weight = '100'): Definition => ({
    evaluaciones: [
      {
        nombre: 'Evaluación sintética',
        unidadId: null,
        pesoPct: weight,
        orden: 1,
        indicadores: [
          {
            codigo: 'SYN-1',
            descripcion: 'Indicador sintético',
            pesoPct: '100',
            orden: 1,
          },
        ],
      },
    ],
  });
  async function createPlan(
    level = english,
    structure = definition(),
    approved = true,
  ) {
    const created = await apiWrite(`niveles/${level}/planes`, 'POST', {
      nombre: unique(),
      formula: 'PONDERADA_JERARQUICA_V1',
      estructura: structure,
    });
    expect(created.status()).toBe(201);
    const result = (await created.json()) as PlanView;
    if (!approved) return result;
    const approval = await apiWrite(
      `planes/${result.plan.id}/aprobacion`,
      'POST',
      {
        revision: result.plan.revision,
        referenciaAprobacion:
          'Referencia sintética de prueba; no aprobación institucional',
        confirmado: true,
      },
    );
    expect(approval.status()).toBe(201);
    return (await approval.json()) as PlanView;
  }
  async function group(level = english) {
    const created = await fixture.group();
    if (level !== created.nivel_id) {
      await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
        created.id,
        level,
      ]);
      created.nivel_id = level;
    }
    const student = await fixture.student();
    const enrollment = await fixture.enroll(created, student);
    return { group: created, student, enrollment };
  }
  async function openPlan(id: string) {
    const loaded = response(`/api/v1/evaluacion/planes/${id}`);
    await page.goto(`${origin}/#/evaluacion/planes/${id}`);
    expect((await loaded).status()).toBe(200);
    await page
      .getByRole('heading', { name: /Versión \d+ de criterios/ })
      .waitFor();
  }
  async function openGroup(g: AttendanceFixtureGroup, status = 200) {
    const loaded = response(`/api/v1/evaluacion/grupos/${g.id}/configuracion`);
    await page.goto(`${origin}/#/evaluacion/grupos/${g.id}`);
    expect((await loaded).status()).toBe(status);
    await page
      .getByRole('heading', { name: 'Evaluaciones del grupo', exact: true })
      .waitFor();
  }
  async function openCreate(level = english) {
    const loaded = response(`/api/v1/evaluacion/niveles/${level}/planes`);
    await page.goto(`${origin}/#/evaluacion/niveles/${level}`);
    expect((await loaded).status()).toBe(200);
    await page
      .getByRole('button', { name: 'Nueva versión', exact: true })
      .click();
    return page.getByRole('dialog', { name: 'Nueva versión', exact: true });
  }
  async function fillComponent(form: Locator, index: number, weight: string) {
    await form
      .getByRole('button', { name: 'Añadir evaluación', exact: true })
      .click();
    expect(
      await form
        .getByLabel(`Peso de evaluación ${index} (%)`, { exact: true })
        .inputValue(),
    ).toBe('');
    await form
      .getByLabel(`Nombre de evaluación ${index}`, { exact: true })
      .fill(`Evaluación sintética ${index}`);
    await form
      .getByLabel(`Peso de evaluación ${index} (%)`, { exact: true })
      .fill(weight);
    await form
      .getByRole('button', {
        name: `Añadir indicador a evaluación ${index}`,
        exact: true,
      })
      .click();
    expect(
      await form
        .getByLabel(`Peso de indicador 1 de evaluación ${index} (%)`, {
          exact: true,
        })
        .inputValue(),
    ).toBe('');
    await form
      .getByLabel(`Código de indicador 1 de evaluación ${index}`, {
        exact: true,
      })
      .fill(`SYN-${index}`);
    await form
      .getByLabel(`Descripción de indicador 1 de evaluación ${index}`, {
        exact: true,
      })
      .fill(`Indicador sintético ${index}`);
    await form
      .getByLabel(`Peso de indicador 1 de evaluación ${index} (%)`, {
        exact: true,
      })
      .fill('100');
  }
  async function approveUi(planId: string) {
    await page
      .getByRole('button', { name: 'Aprobar versión', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aprobar versión',
      exact: true,
    });
    await dialog
      .getByLabel('Referencia de aprobación', { exact: true })
      .fill('Acuerdo sintético B16; solo datos de prueba');
    await dialog
      .getByLabel('Confirmo que el centro aprobó estos criterios', {
        exact: true,
      })
      .check();
    await dialog
      .getByRole('button', { name: 'Revisar aprobación', exact: true })
      .click();
    const saved = response(
      `/api/v1/evaluacion/planes/${planId}/aprobacion`,
      'POST',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar aprobación', exact: true })
      .click();
    expect((await saved).status()).toBe(201);
    await page
      .getByRole('region', { name: 'Aprobación registrada', exact: true })
      .waitFor();
  }
  async function applyUi(g: AttendanceFixtureGroup, planId: string) {
    await page
      .getByRole('button', { name: 'Aplicar versión aprobada', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aplicar versión aprobada',
      exact: true,
    });
    await dialog
      .getByLabel('Versión aprobada', { exact: true })
      .selectOption(planId);
    await dialog
      .getByLabel('Confirmo que estos criterios corresponden al grupo', {
        exact: true,
      })
      .check();
    await dialog
      .getByRole('button', { name: 'Revisar aplicación', exact: true })
      .click();
    const saved = response(
      `/api/v1/evaluacion/grupos/${g.id}/configuracion`,
      'POST',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar aplicación', exact: true })
      .click();
    expect((await saved).status()).toBe(201);
    await page
      .getByRole('heading', { name: 'Criterios aplicados', exact: true })
      .waitFor();
  }
  async function screenshot(name: string) {
    await page.screenshot({ path: `${artifacts}${name}.png`, fullPage: true });
  }

  it('ADMIN crea desde captura vacía, aprueba 33.33+33.33+33.34 y docente aplica una copia persistida', async () => {
    const f = await group();
    await login();
    const form = await openCreate();
    expect(
      await form
        .getByLabel('Nombre de la versión', { exact: true })
        .inputValue(),
    ).toBe('');
    expect(
      await form
        .getByLabel('Fórmula de evaluación', { exact: true })
        .inputValue(),
    ).toBe('');
    const name = unique();
    await form.getByLabel('Nombre de la versión', { exact: true }).fill(name);
    await form
      .getByLabel('Fórmula de evaluación', { exact: true })
      .selectOption('PONDERADA_JERARQUICA_V1');
    for (const [index, weight] of ['33.33', '33.33', '33.34'].entries())
      await fillComponent(form, index + 1, weight);
    await form
      .getByLabel('Unidad de evaluación 1', { exact: true })
      .selectOption(unit);
    await form
      .getByRole('button', { name: 'Revisar borrador', exact: true })
      .click();
    const created = response(
      `/api/v1/evaluacion/niveles/${english}/planes`,
      'POST',
    );
    await form
      .getByRole('button', { name: 'Crear borrador', exact: true })
      .click();
    const result = await created;
    expect(result.status()).toBe(201);
    const { plan } = (await result.json()) as PlanView;
    await page
      .getByRole('region', { name: 'Validación de criterios', exact: true })
      .waitFor();
    await fact(
      page.getByRole('region', {
        name: 'Validación de criterios',
        exact: true,
      }),
      'Peso total de evaluaciones',
      '100.00 %',
    );
    await approveUi(plan.id);
    expect(
      await page
        .getByRole('button', { name: 'Guardar borrador', exact: true })
        .count(),
    ).toBe(0);
    await page.getByText('Ver historial de criterios', { exact: true }).click();
    await contains(
      page.getByRole('table', { name: 'Historial de criterios', exact: true }),
      'Aprobación de criterios',
    );
    await screenshot('criterios-aprobados-historial');
    await login('docente');
    await openGroup(f.group);
    await applyUi(f.group, plan.id);
    const readiness = page.getByRole('region', {
      name: 'Preparación del acta',
      exact: true,
    });
    await fact(readiness, 'Calificaciones pendientes', '3');
    await contains(
      page.getByRole('region', { name: 'Criterios registrados', exact: true }),
      'Unidad sintética',
    );
    const [configuration] = await source.query(
      'SELECT c.plan_id,c.aplicado_por,count(e.id)::int AS evaluaciones FROM configuraciones_evaluacion_grupo c JOIN evaluaciones e ON e.configuracion_id=c.id WHERE c.grupo_id=$1 GROUP BY c.id',
      [f.group.id],
    );
    expect(configuration).toMatchObject({
      plan_id: plan.id,
      aplicado_por: fixture.userIds.docente,
      evaluaciones: 3,
    });
    expect(
      await source.query(
        'SELECT id FROM calificaciones WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
    await screenshot('criterios-grupo-ingles');
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
    await screenshot('criterios-grupo-movil');
  }, 60000);

  it('aplica criterios sintéticos portugueses con asistencia cerrada y conserva las marcas y resultados', async () => {
    const f = await group(portuguese);
    const plan = await createPlan(portuguese);
    const session = await fixture.session(f.group, 'REALIZADA');
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [f.group.id, session.id, f.enrollment.id, fixture.userIds.docente],
    );
    const actor = await apiActor();
    const view = await actor.context.request.get(
      `${origin}/api/v1/asistencia/grupos/${f.group.id}/cierre`,
    );
    const closed = await actor.context.request.post(
      `${origin}/api/v1/asistencia/grupos/${f.group.id}/cierre`,
      {
        data: {
          revision: (await view.json()).revision,
          confirmarPendientes: false,
        },
        headers: {
          Origin: origin,
          'X-Requested-With': 'Excel-Web',
          'X-CSRF-Token': actor.csrf,
        },
      },
    );
    expect(closed.status()).toBe(201);
    const marks = await source.query(
      'SELECT * FROM asistencias WHERE grupo_id=$1',
      [f.group.id],
    );
    await login();
    await openGroup(f.group);
    await applyUi(f.group, plan.plan.id);
    await contains(
      page.getByRole('region', { name: 'Contexto del grupo', exact: true }),
      'Portugués de prueba',
    );
    await fact(
      page.getByRole('region', { name: 'Contexto del grupo', exact: true }),
      'Estado de asistencia',
      'Cerrada',
    );
    expect(
      await source.query('SELECT * FROM asistencias WHERE grupo_id=$1', [
        f.group.id,
      ]),
    ).toEqual(marks);
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
    expect(
      await page
        .getByRole('button', { name: 'Aplicar versión aprobada', exact: true })
        .count(),
    ).toBe(0);
    await screenshot('criterios-grupo-portugues');
  });

  it('guarda sumas 99.99 y 100.01 como borrador, bloquea aprobación y muestra errores de campo sin perder captura', async () => {
    const created = await createPlan(english, definition('99.99'), false);
    await login();
    await openPlan(created.plan.id);
    const validation = page.getByRole('region', {
      name: 'Validación de criterios',
      exact: true,
    });
    await fact(validation, 'Peso total de evaluaciones', '99.99 %');
    expect(
      await page
        .getByRole('button', { name: 'Aprobar versión', exact: true })
        .count(),
    ).toBe(0);
    const weight = page.getByLabel('Peso de evaluación 1 (%)', { exact: true });
    await weight.fill('100,01');
    await page
      .getByRole('button', { name: 'Guardar borrador', exact: true })
      .click();
    expect(await weight.getAttribute('aria-invalid')).toBe('true');
    expect(await weight.inputValue()).toBe('100,01');
    expect(
      (
        await source.query(
          'SELECT revision FROM planes_evaluacion WHERE id=$1',
          [created.plan.id],
        )
      )[0].revision,
    ).toBe(1);
    await weight.fill('100');
    await page
      .getByRole('button', { name: 'Añadir evaluación', exact: true })
      .click();
    await page
      .getByLabel('Nombre de evaluación 2', { exact: true })
      .fill('Evaluación adicional');
    await page
      .getByLabel('Peso de evaluación 2 (%)', { exact: true })
      .fill('0.01');
    const saved = response(
      `/api/v1/evaluacion/planes/${created.plan.id}`,
      'PATCH',
    );
    await page
      .getByRole('button', { name: 'Guardar borrador', exact: true })
      .click();
    expect((await saved).status()).toBe(200);
    await fact(validation, 'Peso total de evaluaciones', '100.01 %');
    await contains(validation, 'agrega al menos un indicador');
    const denied = await apiWrite(
      `planes/${created.plan.id}/aprobacion`,
      'POST',
      {
        revision: 2,
        referenciaAprobacion: 'Prueba de bloqueo',
        confirmado: true,
      },
    );
    expect(denied.status()).toBe(409);
    await page
      .getByRole('button', { name: 'Quitar evaluación 2', exact: true })
      .click();
    const fixed = response(
      `/api/v1/evaluacion/planes/${created.plan.id}`,
      'PATCH',
    );
    await page
      .getByRole('button', { name: 'Guardar borrador', exact: true })
      .click();
    expect((await fixed).status()).toBe(200);
    await fact(validation, 'Configuración', 'Completa para aprobación');
  });

  it('protege captura al cancelar, navegar y cerrar sesión; una falla de envío permite reintentar sin duplicar', async () => {
    await login();
    const form = await openCreate();
    const name = unique();
    await form.getByLabel('Nombre de la versión', { exact: true }).fill(name);
    await form
      .getByLabel('Fórmula de evaluación', { exact: true })
      .selectOption('PONDERADA_JERARQUICA_V1');
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await form
        .getByLabel('Nombre de la versión', { exact: true })
        .inputValue(),
    ).toBe(name);
    const path = `/api/v1/evaluacion/niveles/${english}/planes`;
    await page.route(`**${path}`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Fallo sintético' }),
          })
        : route.continue(),
    );
    await form
      .getByRole('button', { name: 'Revisar borrador', exact: true })
      .click();
    const failed = response(path, 'POST');
    await form
      .getByRole('button', { name: 'Crear borrador', exact: true })
      .click();
    expect((await failed).status()).toBe(503);
    await form.getByLabel('Nombre de la versión', { exact: true }).waitFor();
    expect(
      await form
        .getByLabel('Nombre de la versión', { exact: true })
        .inputValue(),
    ).toBe(name);
    expect(
      await source.query('SELECT id FROM planes_evaluacion WHERE nombre=$1', [
        name,
      ]),
    ).toEqual([]);
    await page.unroute(`**${path}`);
    await form
      .getByRole('button', { name: 'Revisar borrador', exact: true })
      .click();
    const saved = response(path, 'POST');
    await form
      .getByRole('button', { name: 'Crear borrador', exact: true })
      .click();
    expect((await saved).status()).toBe(201);
    await page
      .getByRole('region', { name: 'Validación de criterios', exact: true })
      .waitFor();
    expect(
      await source.query('SELECT id FROM planes_evaluacion WHERE nombre=$1', [
        name,
      ]),
    ).toHaveLength(1);
    const draftName = page.getByLabel('Nombre de la versión', { exact: true });
    await draftName.fill('Captura de borrador para conservar');
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await page.getByRole('link', { name: 'Inicio', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await draftName.inputValue()).toBe(
      'Captura de borrador para conservar',
    );
  });

  it('un conflicto de borrador conserva campos, oculta validación antigua y exige descartar antes de recargar', async () => {
    const created = await createPlan(english, definition(), false);
    await login();
    await openPlan(created.plan.id);
    const capture = page.getByLabel('Nombre de la versión', { exact: true });
    await capture.fill('Captura local sin perder');
    const concurrent = await apiWrite(`planes/${created.plan.id}`, 'PATCH', {
      revision: created.plan.revision,
      nombre: 'Actualización concurrente sintética',
      formula: created.plan.formula,
      estructura: created.plan.estructura,
    });
    expect(concurrent.status()).toBe(200);
    let gets = 0;
    page.on('request', (req) => {
      if (
        req.method() === 'GET' &&
        new URL(req.url()).pathname ===
          `/api/v1/evaluacion/planes/${created.plan.id}`
      )
        gets++;
    });
    const failed = response(
      `/api/v1/evaluacion/planes/${created.plan.id}`,
      'PATCH',
    );
    await page
      .getByRole('button', { name: 'Guardar borrador', exact: true })
      .click();
    expect((await failed).status()).toBe(409);
    await expect.poll(() => capture.isDisabled()).toBe(true);
    expect(await capture.inputValue()).toBe('Captura local sin perder');
    expect(gets).toBe(0);
    expect(
      await page
        .getByRole('region', { name: 'Validación de criterios', exact: true })
        .count(),
    ).toBe(0);
    await page
      .getByRole('button', { name: 'Recargar versión', exact: true })
      .click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await capture.inputValue()).toBe('Captura local sin perder');
    await page
      .getByRole('button', { name: 'Recargar versión', exact: true })
      .click();
    const loaded = response(`/api/v1/evaluacion/planes/${created.plan.id}`);
    await discard
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await loaded).status()).toBe(200);
    await expect
      .poll(() => capture.inputValue())
      .toBe('Actualización concurrente sintética');
    await expect.poll(() => capture.isDisabled()).toBe(false);
    await screenshot('criterios-borrador-recargado');
  });

  it('la aprobación exige referencia y conserva su captura ante revisión obsoleta', async () => {
    const created = await createPlan(english, definition(), false);
    await login();
    await openPlan(created.plan.id);
    await page
      .getByRole('button', { name: 'Aprobar versión', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aprobar versión',
      exact: true,
    });
    await dialog
      .getByRole('button', { name: 'Revisar aprobación', exact: true })
      .click();
    expect(
      await dialog
        .getByLabel('Referencia de aprobación', { exact: true })
        .getAttribute('aria-invalid'),
    ).toBe('true');
    await dialog
      .getByLabel('Referencia de aprobación', { exact: true })
      .fill('Referencia local sintética');
    await dialog
      .getByLabel('Confirmo que el centro aprobó estos criterios', {
        exact: true,
      })
      .check();
    const updated = await apiWrite(`planes/${created.plan.id}`, 'PATCH', {
      revision: 1,
      nombre: 'Borrador actualizado durante revisión',
      formula: created.plan.formula,
      estructura: created.plan.estructura,
    });
    expect(updated.status()).toBe(200);
    await dialog
      .getByRole('button', { name: 'Revisar aprobación', exact: true })
      .click();
    const conflict = response(
      `/api/v1/evaluacion/planes/${created.plan.id}/aprobacion`,
      'POST',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar aprobación', exact: true })
      .click();
    expect((await conflict).status()).toBe(409);
    const reference = dialog.getByLabel('Referencia de aprobación', {
      exact: true,
    });
    await expect.poll(() => reference.isDisabled()).toBe(true);
    expect(await reference.inputValue()).toBe('Referencia local sintética');
    await screenshot('criterios-aprobacion-conflicto');
    await dialog
      .getByRole('button', { name: 'Recargar versión', exact: true })
      .click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(await reference.inputValue()).toBe('Referencia local sintética');
    await dialog
      .getByRole('button', { name: 'Recargar versión', exact: true })
      .click();
    const loaded = response(`/api/v1/evaluacion/planes/${created.plan.id}`);
    await discard
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await loaded).status()).toBe(200);
    await expect
      .poll(() =>
        page
          .getByRole('dialog', { name: 'Aprobar versión', exact: true })
          .count(),
      )
      .toBe(0);
    await approveUi(created.plan.id);
  });

  it('una aplicación concurrente devuelve conflicto y solo recarga explícita muestra la copia guardada', async () => {
    const f = await group();
    const plan = await createPlan();
    await login('docente');
    await openGroup(f.group);
    await page
      .getByRole('button', { name: 'Aplicar versión aprobada', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Aplicar versión aprobada',
      exact: true,
    });
    await dialog
      .getByLabel('Versión aprobada', { exact: true })
      .selectOption(plan.plan.id);
    await dialog
      .getByLabel('Confirmo que estos criterios corresponden al grupo', {
        exact: true,
      })
      .check();
    const concurrent = await apiWrite(
      `grupos/${f.group.id}/configuracion`,
      'POST',
      { planId: plan.plan.id, confirmado: true },
    );
    expect(concurrent.status()).toBe(201);
    await dialog
      .getByRole('button', { name: 'Revisar aplicación', exact: true })
      .click();
    const conflict = response(
      `/api/v1/evaluacion/grupos/${f.group.id}/configuracion`,
      'POST',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar aplicación', exact: true })
      .click();
    expect((await conflict).status()).toBe(409);
    await expect
      .poll(() =>
        dialog.getByLabel('Versión aprobada', { exact: true }).isDisabled(),
      )
      .toBe(true);
    expect(
      await dialog.getByLabel('Versión aprobada', { exact: true }).inputValue(),
    ).toBe(plan.plan.id);
    expect(
      await page
        .getByRole('region', { name: 'Preparación del acta', exact: true })
        .count(),
    ).toBe(0);
    await dialog
      .getByRole('button', { name: 'Recargar configuración', exact: true })
      .click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    const loaded = response(
      `/api/v1/evaluacion/grupos/${f.group.id}/configuracion`,
    );
    await discard
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    expect((await loaded).status()).toBe(200);
    await page
      .getByRole('heading', { name: 'Criterios aplicados', exact: true })
      .waitFor();
    expect(
      await source.query(
        'SELECT id FROM configuraciones_evaluacion_grupo WHERE grupo_id=$1',
        [f.group.id],
      ),
    ).toHaveLength(1);
    expect(
      await page
        .getByRole('button', { name: 'Aplicar versión aprobada', exact: true })
        .count(),
    ).toBe(0);
  });

  it('los lectores consultan sin editar, el docente ajeno recibe denegación y una versión futura no altera el grupo', async () => {
    const f = await group();
    const original = await createPlan();
    const applied = await apiWrite(
      `grupos/${f.group.id}/configuracion`,
      'POST',
      { planId: original.plan.id, confirmado: true },
    );
    expect(applied.status()).toBe(201);
    const saved = await source.query(
      'SELECT * FROM evaluaciones WHERE grupo_id=$1 ORDER BY id',
      [f.group.id],
    );
    const future = await createPlan();
    expect(future.plan.version).toBeGreaterThan(original.plan.version);
    await login('secretaria');
    await openPlan(original.plan.id);
    expect(
      await page
        .getByRole('button', { name: 'Guardar borrador', exact: true })
        .count(),
    ).toBe(0);
    await openGroup(f.group);
    expect(
      await page
        .getByRole('button', { name: 'Aplicar versión aprobada', exact: true })
        .count(),
    ).toBe(0);
    await contains(
      page.getByText('Criterios aplicados', { exact: true }).locator('..'),
      `${original.plan.version} · ${original.plan.nombre}`,
    );
    const denied = await apiWrite(
      `planes/${future.plan.id}/aprobacion`,
      'POST',
      {
        revision: future.plan.revision,
        referenciaAprobacion: 'Intento no autorizado',
        confirmado: true,
      },
      'secretaria',
    );
    expect(denied.status()).toBe(403);
    await login('coordinador');
    await openGroup(f.group);
    await fact(
      page.getByRole('region', { name: 'Preparación del acta', exact: true }),
      'Calificaciones pendientes',
      '1',
    );
    await login('ajeno');
    await openGroup(f.group, 403);
    await page.getByRole('alert').waitFor();
    expect(
      await page
        .getByRole('region', { name: 'Contexto del grupo', exact: true })
        .count(),
    ).toBe(0);
    expect(
      await source.query(
        'SELECT * FROM evaluaciones WHERE grupo_id=$1 ORDER BY id',
        [f.group.id],
      ),
    ).toEqual(saved);
    expect(
      (
        await source.query(
          'SELECT plan_id FROM configuraciones_evaluacion_grupo WHERE grupo_id=$1',
          [f.group.id],
        )
      )[0].plan_id,
    ).toBe(original.plan.id);
  });
});
