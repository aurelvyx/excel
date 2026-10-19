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
  throw new Error('Ejecutar B18 con pnpm test:db');
const password = 'Sintetica-B18-navegador';
const adminName = 'admin_b18_web';
const artifacts = fileURLToPath(new URL('../../../.tmp/b18/', import.meta.url));

describe('B18 navegador React → API → PostgreSQL', () => {
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
      await base.query('CREATE DATABASE excel_acts_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_acts_web_test';
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

  const definition: EvaluationDefinition = {
    evaluaciones: [
      {
        nombre: 'Evaluación sintética B18',
        unidadId: null,
        pesoPct: '100',
        orden: 1,
        indicadores: [
          {
            codigo: 'SYN-A',
            descripcion: 'Indicador sintético B18',
            pesoPct: '100',
            orden: 1,
          },
        ],
      },
    ],
  };
  type Matrix = {
    group: AttendanceFixtureGroup;
    students: AttendanceFixtureStudent[];
    enrollments: AttendanceFixtureEnrollment[];
    indicatorId: string;
    sessionIds: string[];
  };
  async function apiRead(path: string, name = adminName) {
    const actor = await apiActor(name);
    return actor.context.request.get(`${origin}/api/v1/${path}`);
  }
  async function matrix({
    count = 3,
    level,
    notes = ['12.4', '12.5', '20'],
    absences = [3, 3, 4],
    closeAttendance = true,
    sessionsCount = 10,
  }: {
    count?: number;
    level?: string;
    notes?: (string | null)[];
    absences?: number[];
    closeAttendance?: boolean;
    sessionsCount?: number;
  } = {}): Promise<Matrix> {
    const group = await fixture.group();
    const selected = level ?? group.nivel_id;
    if (selected !== group.nivel_id) {
      await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
        group.id,
        selected,
      ]);
      group.nivel_id = selected;
    }
    const students: AttendanceFixtureStudent[] = [];
    const enrollments: AttendanceFixtureEnrollment[] = [];
    for (let index = 0; index < count; index++) {
      const student = await fixture.student();
      students.push(student);
      enrollments.push(await fixture.enroll(group, student));
    }
    const created = await apiWrite(
      `evaluacion/niveles/${selected}/planes`,
      'POST',
      {
        nombre: `Plan sintético B18 ${++sequence}`,
        formula: 'PONDERADA_JERARQUICA_V1',
        estructura: definition,
      },
    );
    expect(created.status()).toBe(201);
    const { plan } = await created.json();
    expect(
      (
        await apiWrite(`evaluacion/planes/${plan.id}/aprobacion`, 'POST', {
          revision: plan.revision,
          referenciaAprobacion:
            'Referencia sintética, no aprobación institucional',
          confirmado: true,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await apiWrite(`evaluacion/grupos/${group.id}/configuracion`, 'POST', {
          planId: plan.id,
          confirmado: true,
        })
      ).status(),
    ).toBe(201);
    const [indicator] = await source.query(
      'SELECT i.id FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.grupo_id=$1',
      [group.id],
    );
    const registros = enrollments.flatMap((enrollment, index) => {
      const note = notes[index % notes.length];
      return note === null
        ? []
        : [
            {
              matriculaId: enrollment.id,
              indicadorId: indicator.id,
              nota: note,
              version: null,
            },
          ];
    });
    if (registros.length)
      expect(
        (
          await apiWrite(
            `evaluacion/grupos/${group.id}/calificaciones`,
            'PATCH',
            { registros },
            'docente',
          )
        ).status(),
      ).toBe(200);
    const sessionIds: string[] = [];
    for (let index = 0; index < sessionsCount; index++) {
      const [day] = await source.query(
        'SELECT ($1::date-$2::integer)::text AS fecha',
        [fixture.today, index],
      );
      const session = await fixture.session(group, 'PROGRAMADA', day.fecha);
      sessionIds.push(session.id);
      expect(
        (
          await apiWrite(
            `asistencia/grupos/${group.id}/sesiones/${session.id}/asistencias`,
            'PATCH',
            {
              registros: enrollments.map((enrollment, student) => ({
                matriculaId: enrollment.id,
                codigo:
                  index < (absences[student % absences.length] ?? 0)
                    ? 'F'
                    : 'P',
                observacion: null,
                version: null,
              })),
            },
            'docente',
          )
        ).status(),
      ).toBe(200);
    }
    if (closeAttendance) {
      const review = await (
        await apiRead(`asistencia/grupos/${group.id}/cierre`)
      ).json();
      expect(
        (
          await apiWrite(`asistencia/grupos/${group.id}/cierre`, 'POST', {
            revision: review.revision,
            motivo: null,
            confirmarPendientes: true,
          })
        ).status(),
      ).toBe(201);
    }
    return {
      group,
      students,
      enrollments,
      indicatorId: indicator.id as string,
      sessionIds,
    };
  }
  const endpoint = (g: AttendanceFixtureGroup) =>
    `/api/v1/evaluacion/grupos/${g.id}/acta`;
  const actPath = (g: AttendanceFixtureGroup) =>
    `evaluacion/grupos/${g.id}/acta`;
  const table = () =>
    page.getByRole('table', { name: 'Resultados del grupo', exact: true });
  const row = (student: AttendanceFixtureStudent) =>
    table()
      .getByRole('row')
      .filter({
        has: page.getByText(`SINTETICO ${student.documento}`, { exact: true }),
      });
  const condition = (student: AttendanceFixtureStudent) =>
    page.getByRole('region', {
      name: `Condición de ${student.nombre}`,
      exact: true,
    });
  const acknowledgement =
    'Confirmo que revisé los datos y la consecuencia de esta acción';
  async function open(g: AttendanceFixtureGroup, status = 200) {
    const loaded = response(endpoint(g));
    await page.goto(`${origin}/#/${actPath(g)}`);
    expect((await loaded).status()).toBe(status);
    await page
      .getByRole('heading', { name: 'Resultados y acta', exact: true })
      .waitFor();
    if (status === 200) await table().waitFor();
  }
  async function closeUi(
    g: AttendanceFixtureGroup,
    reason = 'Cierre sintético B18',
  ) {
    await page
      .getByRole('button', { name: 'Cerrar acta', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cerrar acta',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo del cierre de acta', { exact: true })
      .fill(reason);
    await dialog.getByLabel(acknowledgement, { exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
      .click();
    await contains(dialog, 'no permite reabrir el acta');
    const saved = response(endpoint(g), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre de acta', exact: true })
      .click();
    expect((await saved).status()).toBe(201);
    await page
      .getByText('Acta cerrada y resultados confirmados.', { exact: true })
      .waitFor();
    await page
      .getByRole('heading', { name: 'Acta cerrada', exact: true })
      .waitFor();
    await dialog.waitFor({ state: 'hidden' });
  }
  async function closeApi(g: AttendanceFixtureGroup) {
    const review = await (await apiRead(actPath(g))).json();
    const saved = await apiWrite(actPath(g), 'POST', {
      revision: review.revision,
      motivo: 'Cierre sintético por API para la prueba',
    });
    expect(saved.status()).toBe(201);
    return saved.json();
  }
  async function correction(f: Matrix, kind: 'nota' | 'asistencia', index = 0) {
    const title =
      kind === 'nota'
        ? 'Corregir nota del acta'
        : 'Corregir asistencia del acta';
    await page
      .getByRole('button', {
        name: `Corregir ${kind} de ${f.students[index]!.nombre}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await dialog.getByLabel('Motivo de corrección', { exact: true }).waitFor();
    return dialog;
  }
  async function confirmCorrection(
    g: AttendanceFixtureGroup,
    kind: 'nota' | 'asistencia',
    dialog: Locator,
    reason: string,
    changed = true,
  ) {
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill(reason);
    await dialog.getByLabel(acknowledgement, { exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    const saved = response(`${endpoint(g)}/correccion-${kind}`, 'PATCH');
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    expect((await saved).status()).toBe(200);
    await dialog.waitFor({ state: 'hidden' });
    await page
      .getByText(
        changed
          ? 'Corrección registrada y resultado recalculado.'
          : 'No hay cambios: el registro conserva sus valores y su versión.',
        {
          exact: true,
        },
      )
      .waitFor();
    await expect
      .poll(() =>
        page
          .getByRole('button', { name: 'Recargar acta', exact: true })
          .getAttribute('aria-busy'),
      )
      .toBe(null);
  }
  async function results(f: Matrix) {
    return source.query(
      'SELECT matricula_id,condicion,promedio,nota_oficial,inasistencia_pct,version,cierre_id,confirmado_at FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[]) ORDER BY matricula_id',
      [f.enrollments.map((entry) => entry.id)],
    );
  }
  async function discardReload(dialog: Locator) {
    await dialog
      .getByRole('button', { name: 'Recargar acta', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Descartar cambios', exact: true })
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    await expect
      .poll(() =>
        page
          .getByRole('button', { name: 'Recargar acta', exact: true })
          .getAttribute('aria-busy'),
      )
      .toBe(null);
  }

  it('inglés revisa 30 % exacto y más de 30 %, redondea 12.4/12.5 y cierra todos los intentos sin cerrar grupo ni periodo', async () => {
    const f = await matrix({ level: english });
    await login(adminName);
    await page.goto(`${origin}/#/asistencia/grupos/${f.group.id}`);
    await page
      .getByRole('link', { name: 'Resultados y acta', exact: true })
      .click();
    await table().waitFor();
    await contains(condition(f.students[0]!), 'Desaprobado');
    await contains(condition(f.students[1]!), 'Aprobado');
    await contains(condition(f.students[2]!), 'Retirado por inasistencia');
    await contains(row(f.students[0]!), '30,00 %');
    await contains(row(f.students[2]!), '40,00 %');
    const total = page.getByRole('region', {
      name: 'Revisión completa del grupo',
      exact: true,
    });
    await fact(total, 'Matrículas revisables', '3');
    await fact(total, 'Resultados pendientes', '0');
    expect(await results(f)).toEqual([]);
    await closeUi(f.group);
    const stored = await results(f);
    expect(
      stored.map((entry: { condicion: string }) => entry.condicion),
    ).toEqual(['DESAPROBADO', 'APROBADO', 'RETIRADO_INASISTENCIA']);
    expect(
      stored.map((entry: { nota_oficial: number }) => entry.nota_oficial),
    ).toEqual([12, 13, 20]);
    expect(
      stored.every(
        (entry: {
          version: number;
          confirmado_at: string;
          cierre_id: string;
        }) => entry.version === 1 && entry.confirmado_at && entry.cierre_id,
      ),
    ).toBe(true);
    expect(
      await source.query(
        'SELECT estado FROM matriculas WHERE id=ANY($1::bigint[]) ORDER BY id',
        [f.enrollments.map((entry) => entry.id)],
      ),
    ).toEqual([
      { estado: 'CERRADA' },
      { estado: 'CERRADA' },
      { estado: 'CERRADA' },
    ]);
    expect(
      await source.query(
        'SELECT g.estado,p.estado AS periodo_estado FROM grupos g JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=$1',
        [f.group.id],
      ),
    ).toEqual([{ estado: 'ACTIVO', periodo_estado: 'ABIERTO' }]);
    await screenshot('acta-ingles-escritorio');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await screenshot('acta-ingles-movil');
  });

  it('portugués corrige una nota cerrada, recalcula el resultado y conserva la revisión original y auditoría', async () => {
    const f = await matrix({
      count: 1,
      level: portuguese,
      notes: ['12.4'],
      absences: [3],
    });
    await closeApi(f.group);
    await login(adminName);
    await open(f.group);
    await contains(condition(f.students[0]!), 'Desaprobado');
    const dialog = await correction(f, 'nota');
    expect(
      await dialog.getByLabel('Nueva nota', { exact: true }).inputValue(),
    ).toBe('12,40');
    await dialog.getByLabel('Nueva nota', { exact: true }).fill('12,5');
    await confirmCorrection(
      f.group,
      'nota',
      dialog,
      'Corrección sintética portuguesa de nota',
    );
    await contains(condition(f.students[0]!), 'Aprobado');
    expect((await results(f))[0]).toMatchObject({
      condicion: 'APROBADO',
      promedio: '12.50',
      nota_oficial: 13,
      version: 2,
    });
    await page
      .getByText('Consultar revisión original del cierre', { exact: true })
      .click();
    const original = page.getByRole('table', {
      name: 'Resultados de la revisión original',
      exact: true,
    });
    await contains(original, 'Desaprobado');
    await contains(original, '12,40');
    const history = page.getByRole('table', {
      name: 'Historial de resultados del acta',
      exact: true,
    });
    await contains(history, 'Corrección de nota');
    await contains(history, 'Corrección sintética portuguesa de nota');
    await contains(history, adminName);
    expect(
      await source.query(
        "SELECT accion,motivo,valor_anterior->>'nota' AS antes,valor_nuevo->>'nota' AS despues FROM auditoria_eventos WHERE accion='CORRECT_CLOSED_GRADE' AND entidad_id=(SELECT id::text FROM calificaciones WHERE matricula_id=$1)",
        [f.enrollments[0]!.id],
      ),
    ).toEqual([
      {
        accion: 'CORRECT_CLOSED_GRADE',
        motivo: 'Corrección sintética portuguesa de nota',
        antes: '12.40',
        despues: '12.50',
      },
    ]);
    await screenshot('acta-portugues-corregida');
    const unchanged = await results(f);
    const noChange = await correction(f, 'nota');
    await confirmCorrection(
      f.group,
      'nota',
      noChange,
      'Verificación sintética sin cambio de valor',
      false,
    );
    expect(await results(f)).toEqual(unchanged);
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE accion='CORRECT_CLOSED_GRADE' AND entidad_id=(SELECT id::text FROM calificaciones WHERE matricula_id=$1)",
        [f.enrollments[0]!.id],
      ),
    ).toHaveLength(1);
  });

  it('la corrección de asistencia recalcula 40 % a 30 % y conserva notas y cierre original', async () => {
    const f = await matrix({ count: 1, notes: ['13'], absences: [4] });
    const closed = await closeApi(f.group);
    const before = await source.query(
      'SELECT id,nota,version FROM calificaciones WHERE matricula_id=$1',
      [f.enrollments[0]!.id],
    );
    const originalClosure = await source.query(
      'SELECT resumen FROM cierres_academicos WHERE id=$1',
      [closed.cierre.id],
    );
    await login(adminName);
    await open(f.group);
    await contains(condition(f.students[0]!), 'Retirado por inasistencia');
    const dialog = await correction(f, 'asistencia');
    await dialog
      .getByLabel('Sesión a corregir', { exact: true })
      .selectOption(f.sessionIds[0]!);
    await dialog.getByLabel('Nueva marca', { exact: true }).selectOption('P');
    await dialog
      .getByLabel('Observación', { exact: true })
      .fill('Corrección sintética de marca');
    await confirmCorrection(
      f.group,
      'asistencia',
      dialog,
      'Rectificación sintética de asistencia',
    );
    await contains(condition(f.students[0]!), 'Aprobado');
    await contains(row(f.students[0]!), '30,00 %');
    expect((await results(f))[0]).toMatchObject({
      condicion: 'APROBADO',
      inasistencia_pct: '30.00',
      version: 2,
    });
    expect(
      await source.query(
        'SELECT id,nota,version FROM calificaciones WHERE matricula_id=$1',
        [f.enrollments[0]!.id],
      ),
    ).toEqual(before);
    expect(
      await source.query('SELECT resumen FROM cierres_academicos WHERE id=$1', [
        closed.cierre.id,
      ]),
    ).toEqual(originalClosure);
    await page
      .getByRole('button', {
        name: `Detalle e historial de ${f.students[0]!.nombre}`,
        exact: true,
      })
      .click();
    const detail = page.getByRole('dialog', {
      name: 'Detalle e historial del intento',
      exact: true,
    });
    await contains(detail, 'Rectificación sintética de asistencia');
    await contains(detail, 'Corrección de asistencia');
    await contains(
      detail.getByRole('table', {
        name: 'Asistencias del intento',
        exact: true,
      }),
      'Corrección sintética de marca',
    );
    await screenshot('acta-historial-correccion');
  });

  it('los datos incompletos, las notas pendientes y la falta de sesiones impiden emitir resultados definitivos', async () => {
    const f = await matrix({ count: 1, notes: [null], closeAttendance: false });
    await login(adminName);
    await open(f.group);
    await contains(condition(f.students[0]!), 'Resultado pendiente');
    expect(
      await page
        .getByRole('button', { name: 'Cerrar acta', exact: true })
        .count(),
    ).toBe(0);
    await contains(
      page.getByRole('region', {
        name: 'Revisión completa del grupo',
        exact: true,
      }),
      'asistencia',
    );
    expect(await results(f)).toEqual([]);
    const empty = await matrix({ count: 1, notes: ['0'], sessionsCount: 0 });
    await open(empty.group);
    await contains(condition(empty.students[0]!), 'Resultado pendiente');
    await contains(row(empty.students[0]!), 'Sin sesiones computables');
    expect(
      await page
        .getByRole('button', { name: 'Cerrar acta', exact: true })
        .count(),
    ).toBe(0);
    expect(await results(empty)).toEqual([]);
  });

  it('docente asignado, secretaría y coordinación consultan; un docente ajeno no recibe el padrón', async () => {
    const f = await matrix({ count: 1 });
    for (const name of ['docente', 'secretaria', 'coordinador']) {
      await login(name);
      await open(f.group);
      await contains(row(f.students[0]!), f.students[0]!.nombre);
      expect(
        await page
          .getByRole('button', { name: 'Cerrar acta', exact: true })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByRole('button', { name: /Corregir (nota|asistencia) de/ })
          .count(),
      ).toBe(0);
    }
    await login('ajeno');
    await open(f.group, 403);
    await contains(page.getByRole('alert'), 'No tienes permiso');
    expect(await table().count()).toBe(0);
    expect(
      await page.getByText(f.students[0]!.nombre, { exact: true }).count(),
    ).toBe(0);
  });

  it('un conflicto de cierre conserva motivo y revisión hasta recarga con descarte explícito', async () => {
    const f = await matrix({ count: 1 });
    await login(adminName);
    await open(f.group);
    await page
      .getByRole('button', { name: 'Cerrar acta', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cerrar acta',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo del cierre de acta', { exact: true })
      .fill('Motivo sintético conservado');
    await dialog.getByLabel(acknowledgement, { exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
      .click();
    expect(
      (
        await apiWrite(
          `evaluacion/grupos/${f.group.id}/calificaciones`,
          'PATCH',
          {
            registros: [
              {
                matriculaId: f.enrollments[0]!.id,
                indicadorId: f.indicatorId,
                nota: '13',
                version: 1,
              },
            ],
          },
          'docente2',
        )
      ).status(),
    ).toBe(200);
    const saved = response(endpoint(f.group), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre de acta', exact: true })
      .click();
    expect((await saved).status()).toBe(409);
    expect(
      await dialog
        .getByLabel('Motivo del cierre de acta', { exact: true })
        .inputValue(),
    ).toBe('Motivo sintético conservado');
    expect(
      await dialog
        .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(await results(f)).toEqual([]);
    await contains(condition(f.students[0]!), 'Resultado no actualizado');
    await screenshot('acta-conflicto-cierre');
    await discardReload(dialog);
    await contains(condition(f.students[0]!), 'Aprobado');
    await closeUi(f.group, 'Cierre con revisión vigente');
  });

  it('la corrección con versión obsoleta conserva la nueva nota y el motivo sin sobrescribir otro cambio', async () => {
    const f = await matrix({ count: 1, notes: ['12'] });
    await closeApi(f.group);
    await login(adminName);
    await open(f.group);
    const dialog = await correction(f, 'nota');
    await dialog.getByLabel('Nueva nota', { exact: true }).fill('15');
    await dialog
      .getByLabel('Motivo de corrección', { exact: true })
      .fill('Motivo sintético en conflicto');
    await dialog.getByLabel(acknowledgement, { exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    const detail = await (
      await apiRead(`${actPath(f.group)}/${f.enrollments[0]!.id}`)
    ).json();
    expect(
      (
        await apiWrite(`${actPath(f.group)}/correccion-nota`, 'PATCH', {
          cierreId: detail.cierre.id,
          matriculaId: f.enrollments[0]!.id,
          calificacionId: detail.calificaciones[0].id,
          version: detail.calificaciones[0].version,
          resultadoVersion: detail.item.resultado.version,
          nota: '14',
          motivo: 'Otro cambio sintético',
        })
      ).status(),
    ).toBe(200);
    const saved = response(`${endpoint(f.group)}/correccion-nota`, 'PATCH');
    await dialog
      .getByRole('button', { name: 'Confirmar corrección', exact: true })
      .click();
    expect((await saved).status()).toBe(409);
    expect(
      await dialog.getByLabel('Nueva nota', { exact: true }).inputValue(),
    ).toBe('15');
    expect(
      await dialog
        .getByLabel('Motivo de corrección', { exact: true })
        .inputValue(),
    ).toBe('Motivo sintético en conflicto');
    expect((await results(f))[0]).toMatchObject({
      nota_oficial: 14,
      version: 2,
    });
    await discardReload(dialog);
    await contains(row(f.students[0]!), '14,00');
  });

  it('valida rango, precisión, motivo y reconocimiento antes de enviar una corrección', async () => {
    const f = await matrix({ count: 1 });
    await closeApi(f.group);
    await login(adminName);
    await open(f.group);
    let sent = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname ===
          `${endpoint(f.group)}/correccion-nota`
      )
        sent++;
    });
    const dialog = await correction(f, 'nota');
    const note = dialog.getByLabel('Nueva nota', { exact: true });
    for (const invalid of ['-1', '20.01', '12.345', '1e1', '']) {
      await note.fill(invalid);
      await dialog
        .getByRole('button', { name: 'Revisar corrección', exact: true })
        .click();
      await expect.poll(() => note.getAttribute('aria-invalid')).toBe('true');
      await expect
        .poll(() =>
          note.evaluate((element) => document.activeElement === element),
        )
        .toBe(true);
      expect(await note.inputValue()).toBe(invalid);
    }
    await note.fill('0');
    await dialog
      .getByRole('button', { name: 'Revisar corrección', exact: true })
      .click();
    await contains(dialog, 'Indica el motivo de la corrección.');
    expect(sent).toBe(0);
    expect((await results(f))[0]).toMatchObject({
      nota_oficial: 12,
      version: 1,
    });
    await confirmCorrection(
      f.group,
      'nota',
      dialog,
      'Corrección sintética a cero',
    );
    expect((await results(f))[0]).toMatchObject({
      nota_oficial: 0,
      condicion: 'DESAPROBADO',
      version: 2,
    });
  });

  it('un fallo de envío permite reintentar y una reconsulta fallida oculta los cálculos antiguos', async () => {
    const f = await matrix({ count: 1 });
    await login(adminName);
    await open(f.group);
    await page
      .getByRole('button', { name: 'Cerrar acta', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Cerrar acta',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo del cierre de acta', { exact: true })
      .fill('Cierre sintético con reintento');
    await dialog.getByLabel(acknowledgement, { exact: true }).check();
    await dialog
      .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
      .click();
    await page.route(`**${endpoint(f.group)}`, async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else await route.continue();
    });
    await dialog
      .getByRole('button', { name: 'Confirmar cierre de acta', exact: true })
      .click();
    await contains(dialog.getByRole('alert'), 'El servicio no pudo completar');
    expect(
      await dialog
        .getByLabel('Motivo del cierre de acta', { exact: true })
        .inputValue(),
    ).toBe('Cierre sintético con reintento');
    expect(await results(f)).toEqual([]);
    await page.unroute(`**${endpoint(f.group)}`);
    await page.route(`**${endpoint(f.group)}?*`, async (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await dialog
      .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
      .click();
    const saved = response(endpoint(f.group), 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre de acta', exact: true })
      .click();
    expect((await saved).status()).toBe(201);
    await contains(condition(f.students[0]!), 'Resultado no actualizado');
    expect(
      await page
        .getByRole('region', {
          name: 'Revisión completa del grupo',
          exact: true,
        })
        .count(),
    ).toBe(0);
    expect(await results(f)).toHaveLength(1);
    await page.unroute(`**${endpoint(f.group)}?*`);
    await page
      .getByRole('button', { name: 'Recargar acta', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Acta cerrada', exact: true })
      .waitFor();
    await contains(condition(f.students[0]!), 'Desaprobado');
  });

  it('cancelación, navegación por hash y cierre de sesión respetan la corrección sin guardar', async () => {
    const f = await matrix({ count: 1 });
    await closeApi(f.group);
    await login(adminName);
    await open(f.group);
    const dialog = await correction(f, 'nota');
    await dialog.getByLabel('Nueva nota', { exact: true }).fill('16');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const discard = page.getByRole('dialog', {
      name: 'Descartar cambios',
      exact: true,
    });
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(
      await dialog.getByLabel('Nueva nota', { exact: true }).inputValue(),
    ).toBe('16');
    await page.evaluate(() => {
      window.location.hash = '/';
    });
    await discard.waitFor();
    expect(new URL(page.url()).hash).toBe(`#/${actPath(f.group)}`);
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach((button) => {
          if (button.textContent === 'Cerrar sesión') button.click();
        });
    });
    await discard.waitFor();
    await discard
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect((await results(f))[0]).toMatchObject({
      nota_oficial: 12,
      version: 1,
    });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await discard
      .getByRole('button', { name: 'Descartar y continuar', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
  });

  it('una J con expediente conserva su marca y decisiones; la observación se corrige con resultado auditado', async () => {
    const f = await matrix({
      count: 1,
      notes: ['13'],
      absences: [0],
      sessionsCount: 1,
      closeAttendance: false,
    });
    expect(
      (
        await apiWrite(
          `asistencia/grupos/${f.group.id}/sesiones/${f.sessionIds[0]}/asistencias`,
          'PATCH',
          {
            registros: [
              {
                matriculaId: f.enrollments[0]!.id,
                codigo: 'J',
                observacion: null,
                version: 1,
              },
            ],
          },
          'docente',
        )
      ).status(),
    ).toBe(200);
    const [attendance] = await source.query(
      'SELECT id,version FROM asistencias WHERE matricula_id=$1',
      [f.enrollments[0]!.id],
    );
    const created = await apiWrite(
      `asistencia/grupos/${f.group.id}/justificaciones`,
      'POST',
      {
        asistenciaId: attendance.id,
        asistenciaVersion: attendance.version,
        motivo: 'Expediente sintético pendiente',
        fechaPresentacion: fixture.today,
      },
      'secretaria',
    );
    expect(created.status()).toBe(201);
    const before = await source.query(
      'SELECT id,estado,version,motivo FROM justificaciones WHERE asistencia_id=$1',
      [attendance.id],
    );
    const attendanceReview = await (
      await apiRead(`asistencia/grupos/${f.group.id}/cierre`)
    ).json();
    expect(
      (
        await apiWrite(`asistencia/grupos/${f.group.id}/cierre`, 'POST', {
          revision: attendanceReview.revision,
          motivo: null,
          confirmarPendientes: true,
        })
      ).status(),
    ).toBe(201);
    await closeApi(f.group);
    await login(adminName);
    await open(f.group);
    const dialog = await correction(f, 'asistencia');
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).isDisabled(),
    ).toBe(true);
    expect(
      await dialog.getByLabel('Nueva marca', { exact: true }).inputValue(),
    ).toBe('J');
    await contains(dialog, 'La marca J conserva su expediente.');
    await dialog
      .getByLabel('Observación', { exact: true })
      .fill('Observación sintética posterior al acta');
    await confirmCorrection(
      f.group,
      'asistencia',
      dialog,
      'Corrección sintética de observación protegida',
    );
    expect(
      await source.query(
        'SELECT codigo,observacion FROM asistencias WHERE id=$1',
        [attendance.id],
      ),
    ).toEqual([
      { codigo: 'J', observacion: 'Observación sintética posterior al acta' },
    ]);
    expect(
      await source.query(
        'SELECT id,estado,version,motivo FROM justificaciones WHERE asistencia_id=$1',
        [attendance.id],
      ),
    ).toEqual(before);
    expect((await results(f))[0]).toMatchObject({
      condicion: 'RETIRADO_INASISTENCIA',
      version: 2,
    });
  });

  it('los totales y el cierre abarcan todas las páginas, incluidas matrículas fuera de las primeras veinte', async () => {
    const f = await matrix({
      count: 21,
      notes: ['13'],
      absences: [0],
      sessionsCount: 1,
    });
    await login(adminName);
    await open(f.group);
    expect(await table().getByRole('row').count()).toBe(21);
    await fact(
      page.getByRole('region', {
        name: 'Revisión completa del grupo',
        exact: true,
      }),
      'Matrículas revisables',
      '21',
    );
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect.poll(() => table().getByRole('row').count()).toBe(2);
    await contains(row(f.students[20]!), f.students[20]!.nombre);
    await closeUi(f.group);
    expect(await results(f)).toHaveLength(21);
    await contains(row(f.students[20]!), 'CERRADA');
    await page
      .getByRole('button', { name: 'Primera página', exact: true })
      .click();
    await expect.poll(() => table().getByRole('row').count()).toBe(21);
    expect(
      await page
        .getByRole('button', { name: 'Cerrar acta', exact: true })
        .count(),
    ).toBe(0);
  });
});
