import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from 'playwright';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import {
  createWebServer,
  freePort,
  type ViteServer,
} from './browser-server.js';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { COOKIE_NAME, digest } from '../src/modules/auth/security.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureGroup,
  type AttendanceFixtureStudent,
  type AttendanceFixtureEnrollment,
} from './attendance.fixture.js';
import type {
  ReportPage,
  ReportType,
} from '../src/modules/reportes/report.model.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B19 con pnpm test:db');
const password = 'Sintetica-B19-navegador';
const adminName = 'admin_b19_web';
const artifacts = fileURLToPath(new URL('../../../.tmp/b19/', import.meta.url));

describe('B19 navegador React → API → PostgreSQL → XLSX de demostración', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
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
      await base.query('CREATE DATABASE excel_reports_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_reports_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(source, adminName, password);
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    fixture = await attendanceFixture(source, admin.id, password);
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
      acceptDownloads: true,
    });
    await context.addInitScript(() => {
      const events = { created: [] as string[], revoked: [] as string[] };
      Object.defineProperty(window, 'b19BlobUrls', { value: events });
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        events.created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        events.revoked.push(url);
        revoke(url);
      };
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
  const endpoint = (g: AttendanceFixtureGroup) =>
    `/api/v1/reportes/grupos/${g.id}`;
  function response(path: string, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === path &&
        res.request().method() === method,
    );
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
  async function actor(name = adminName) {
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
    const result = {
      context: actorContext,
      csrf: (await logged.json()).csrfToken as string,
    };
    actors.set(name, result);
    return result;
  }
  async function write(
    path: string,
    data: unknown,
    name = adminName,
    method = 'POST',
  ) {
    const user = await actor(name);
    return user.context.request.fetch(`${origin}/api/v1/${path}`, {
      method,
      data,
      headers: {
        Origin: origin,
        'X-Requested-With': 'Excel-Web',
        'X-CSRF-Token': user.csrf,
      },
    });
  }
  async function read(path: string, name = adminName) {
    return (await actor(name)).context.request.get(`${origin}/api/v1/${path}`);
  }
  type Matrix = {
    group: AttendanceFixtureGroup;
    students: AttendanceFixtureStudent[];
    enrollments: AttendanceFixtureEnrollment[];
    indicator: string;
  };
  async function matrix(
    count = 3,
    level = english,
    notes: (string | null)[] = ['0', null, '12.5'],
  ): Promise<Matrix> {
    const group = await fixture.group();
    await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
      group.id,
      level,
    ]);
    group.nivel_id = level;
    const students: AttendanceFixtureStudent[] = [];
    const enrollments: AttendanceFixtureEnrollment[] = [];
    for (let i = 0; i < count; i++) {
      const student = await fixture.student();
      students.push(student);
      enrollments.push(await fixture.enroll(group, student));
    }
    const created = await write(`evaluacion/niveles/${level}/planes`, {
      nombre: `Plan sintético B19 ${++sequence}`,
      formula: 'PONDERADA_JERARQUICA_V1',
      estructura: {
        evaluaciones: [
          {
            nombre: 'Evaluación sintética B19',
            unidadId: null,
            pesoPct: '100',
            orden: 1,
            indicadores: [
              {
                codigo: 'SYN-B19',
                descripcion: 'Indicador sintético de demostración',
                pesoPct: '100',
                orden: 1,
              },
            ],
          },
        ],
      },
    });
    expect(created.status()).toBe(201);
    const { plan } = await created.json();
    expect(
      (
        await write(`evaluacion/planes/${plan.id}/aprobacion`, {
          revision: plan.revision,
          referenciaAprobacion:
            'Referencia sintética, no aprobación institucional',
          confirmado: true,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await write(`evaluacion/grupos/${group.id}/configuracion`, {
          planId: plan.id,
          confirmado: true,
        })
      ).status(),
    ).toBe(201);
    const [indicator] = await source.query(
      'SELECT i.id FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.grupo_id=$1',
      [group.id],
    );
    const registros = enrollments.flatMap((enrollment, index) =>
      notes[index % notes.length] === null
        ? []
        : [
            {
              matriculaId: enrollment.id,
              indicadorId: indicator.id,
              nota: notes[index % notes.length],
              version: null,
            },
          ],
    );
    if (registros.length)
      expect(
        (
          await write(
            `evaluacion/grupos/${group.id}/calificaciones`,
            { registros },
            'docente',
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    return { group, students, enrollments, indicator: indicator.id as string };
  }
  async function open(
    g: AttendanceFixtureGroup,
    type: ReportType = 'MATRIZ_NOTAS',
    status = 200,
  ) {
    const loaded = response(endpoint(g));
    await page.goto(`${origin}/#/reportes/grupos/${g.id}?tipo=${type}`);
    expect((await loaded).status()).toBe(status);
    await page
      .getByRole('heading', { name: 'Reportes del grupo', exact: true })
      .waitFor();
    if (status === 200)
      await page
        .getByRole('region', {
          name: 'Resumen del grupo completo',
          exact: true,
        })
        .waitFor();
  }
  async function review() {
    await page
      .getByRole('button', { name: 'Revisar exportación', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Generar borrador XLSX',
      exact: true,
    });
    await dialog
      .getByLabel(
        'Revisé el contexto, los pendientes y el carácter de borrador',
        { exact: true },
      )
      .check();
    await dialog
      .getByRole('button', { name: 'Revisar borrador', exact: true })
      .click();
    return dialog;
  }
  async function exportBook(g: AttendanceFixtureGroup) {
    const dialog = await review();
    const downloaded = page.waitForEvent('download');
    const generated = response(`${endpoint(g)}/exportaciones`, 'POST');
    await dialog
      .getByRole('button', { name: 'Generar XLSX', exact: true })
      .click();
    const res = await generated;
    expect([200, 201]).toContain(res.status());
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['x-exportacion-id']).toMatch(/^[1-9][0-9]*$/);
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(
      /^[A-Za-z0-9][A-Za-z0-9._-]*\.xlsx$/,
    );
    const path = await file.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(bytes).buffer);
    await contains(
      page.getByRole('region', {
        name: 'Historial de exportaciones',
        exact: true,
      }),
      file.suggestedFilename(),
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const events = (
            window as unknown as Window & {
              b19BlobUrls: { created: string[]; revoked: string[] };
            }
          ).b19BlobUrls;
          return (
            events.created.length > 0 &&
            events.created.every((url) => events.revoked.includes(url))
          );
        }),
      )
      .toBe(true);
    return { book, file, res };
  }
  async function screenshot(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${artifacts}${name}.png`, fullPage: true });
  }
  const totals = () =>
    page.getByRole('region', {
      name: 'Resumen del grupo completo',
      exact: true,
    });
  const matrixTable = () =>
    page.getByRole('table', {
      name: 'Vista previa de matriz de notas',
      exact: true,
    });

  it('inglés y portugués descargan matrices reales, conservan cero y pendientes y registran cada generación', async () => {
    for (const [level, code, firstRow] of [
      [english, 'ingles', 10],
      [portuguese, 'portugues', 9],
    ] as const) {
      const f = await matrix(3, level);
      await login('docente');
      await open(f.group);
      await fact(totals(), 'Intentos matriculados', '3');
      await fact(totals(), 'Aprobados confirmados', 'Pendiente');
      await contains(matrixTable(), '0,00');
      await contains(matrixTable(), 'Pendiente');
      const { book, file } = await exportBook(f.group);
      expect(book.worksheets).toHaveLength(1);
      const sheet = book.getWorksheet('Matriz')!;
      expect(sheet.getCell('A2').text).toContain('BORRADOR');
      expect(sheet.getCell(`D${firstRow}`).value).toBe(0);
      expect(sheet.getCell(`D${firstRow + 1}`).value).toBeNull();
      expect(sheet.getCell(`D${firstRow + 2}`).value).toBe(12.5);
      expect(sheet.getCell(`F${firstRow + 2}`).value).toBe(13);
      expect(sheet.getCell(`H${firstRow + 2}`).value).toBeNull();
      const [event] = await source.query(
        'SELECT archivo_nombre,modo,filas,usuario_id FROM exportaciones WHERE grupo_id=$1',
        [f.group.id],
      );
      expect(event).toMatchObject({
        archivo_nombre: file.suggestedFilename(),
        modo: 'BORRADOR',
        filas: 3,
        usuario_id: fixture.userIds.docente,
      });
      await screenshot(`matriz-${code}-escritorio`);
    }
  }, 60000);

  it('coordinación exporta los dos resúmenes propuestos con aprobados pendientes y sin inventar datos institucionales', async () => {
    for (const [level, code] of [
      [english, 'ingles'],
      [portuguese, 'portugues'],
    ] as const) {
      const f = await matrix(2, level);
      await login('coordinador');
      await open(f.group, 'RESUMEN_PARTICIPANTES');
      expect(await page.getByLabel('Tipo de reporte').inputValue()).toBe(
        'RESUMEN_PARTICIPANTES',
      );
      await contains(
        page.getByRole('table', {
          name: 'Resumen de participantes',
          exact: true,
        }),
        'Pendiente',
      );
      const { book } = await exportBook(f.group);
      const sheet = book.getWorksheet('ANEXO N° 05')!;
      expect(sheet.getCell('A2').text).toContain('BORRADOR');
      expect(sheet.getCell('K11').value).toBe(2);
      expect(sheet.getCell('L11').value).toBeNull();
      expect(sheet.getCell('C3').text.toLowerCase()).toContain('pendiente');
      await screenshot(`resumen-${code}-escritorio`);
    }
  }, 60000);

  it('paginar conserva totales del grupo y revisión exporta todas las filas; móvil desplaza solo la tabla', async () => {
    const f = await matrix(21, english, ['14']);
    await login();
    await open(f.group);
    expect(await matrixTable().getByRole('row').count()).toBe(21);
    await fact(totals(), 'Intentos matriculados', '21');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await contains(matrixTable(), f.students[20]!.nombre);
    expect(await matrixTable().getByRole('row').count()).toBe(2);
    await fact(totals(), 'Intentos matriculados', '21');
    const { book } = await exportBook(f.group);
    expect(book.getWorksheet('Matriz')!.getCell('C30').value).toBe(
      f.students[20]!.nombre,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole('region', {
          name: 'Tabla de vista previa de matriz de notas',
          exact: true,
        })
        .evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
    await screenshot('matriz-movil-paginacion');
  });

  it('el conflicto por cambio posterior conserva selección y exige recarga explícita antes de generar', async () => {
    const f = await matrix(1, english, ['14']);
    await login();
    await open(f.group);
    const dialog = await review();
    expect(
      (
        await write(
          `evaluacion/grupos/${f.group.id}/calificaciones`,
          {
            registros: [
              {
                matriculaId: f.enrollments[0]!.id,
                indicadorId: f.indicator,
                nota: '16',
                version: 1,
              },
            ],
          },
          'docente',
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    const conflicted = response(`${endpoint(f.group)}/exportaciones`, 'POST');
    await dialog
      .getByRole('button', { name: 'Generar XLSX', exact: true })
      .click();
    expect((await conflicted).status()).toBe(409);
    await contains(dialog, 'Recarga la vista previa');
    expect(
      await dialog
        .getByRole('button', { name: 'Generar XLSX', exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(await page.getByLabel('Tipo de reporte').inputValue()).toBe(
      'MATRIZ_NOTAS',
    );
    expect(
      await source.query('SELECT id FROM exportaciones WHERE grupo_id=$1', [
        f.group.id,
      ]),
    ).toEqual([]);
    await screenshot('conflicto-vista-previa');
    await dialog
      .getByRole('button', { name: 'Recargar vista previa', exact: true })
      .click();
    await contains(matrixTable(), '16,00');
    const { book } = await exportBook(f.group);
    expect(book.getWorksheet('Matriz')!.getCell('D10').value).toBe(16);
  });

  it('fallos iniciales y de descarga admiten reintento sin perder el tipo, y el historial muestra el error separadamente', async () => {
    const f = await matrix(1);
    await login();
    await page.route(`**${endpoint(f.group)}?*`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await open(f.group, 'RESUMEN_PARTICIPANTES', 503);
    await page.getByRole('alert').waitFor();
    await page.unroute(`**${endpoint(f.group)}?*`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await totals().waitFor();
    await page.route(`**${endpoint(f.group)}/exportaciones`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{}',
          })
        : route.continue(),
    );
    const dialog = await review();
    await dialog
      .getByRole('button', { name: 'Generar XLSX', exact: true })
      .click();
    await contains(dialog, 'La selección se conserva');
    expect(await page.getByLabel('Tipo de reporte').inputValue()).toBe(
      'RESUMEN_PARTICIPANTES',
    );
    expect(
      await dialog
        .getByRole('button', { name: 'Generar XLSX', exact: true })
        .isDisabled(),
    ).toBe(false);
    await page.unroute(`**${endpoint(f.group)}/exportaciones`);
    await page.keyboard.press('Escape');
    await exportBook(f.group);
    await page.route(`**${endpoint(f.group)}/exportaciones?*`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await page
      .getByRole('button', { name: 'Recargar vista previa', exact: true })
      .click();
    await contains(
      page.getByRole('region', {
        name: 'Historial de exportaciones',
        exact: true,
      }),
      'El servicio no pudo',
    );
    await contains(
      page.getByRole('table', {
        name: 'Resumen de participantes',
        exact: true,
      }),
      'Pendiente',
    );
  });

  it('docente asignado solo ve matriz; docente ajeno y secretaría no acceden a los datos', async () => {
    const f = await matrix(1);
    await login('docente');
    await open(f.group);
    expect(
      await page.getByLabel('Tipo de reporte').locator('option').count(),
    ).toBe(1);
    await open(f.group, 'RESUMEN_PARTICIPANTES', 403);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('main').textContent()).not.toContain(
      f.students[0]!.nombre,
    );
    await login('ajeno');
    await open(f.group, 'MATRIZ_NOTAS', 403);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('main').textContent()).not.toContain(
      f.students[0]!.nombre,
    );
    await login('secretaria');
    expect(
      await page
        .getByRole('navigation', { name: 'Navegación principal' })
        .getByRole('link', { name: 'Reportes', exact: true })
        .count(),
    ).toBe(0);
    await page.goto(`${origin}/#/reportes/grupos/${f.group.id}`);
    await page
      .getByRole('heading', { name: 'Página no disponible', exact: true })
      .waitFor();
    expect(
      (await read(`reportes/grupos/${f.group.id}`, 'secretaria')).status(),
    ).toBe(403);
    const preview = (await (
      await read(`reportes/grupos/${f.group.id}?tipo=MATRIZ_NOTAS`)
    ).json()) as ReportPage;
    expect(
      (
        await write(
          `reportes/grupos/${f.group.id}/exportaciones`,
          { tipo: 'MATRIZ_NOTAS', revision: preview.revision },
          'ajeno',
        )
      ).status(),
    ).toBe(403);
    expect(
      await source.query('SELECT id FROM exportaciones WHERE grupo_id=$1', [
        f.group.id,
      ]),
    ).toEqual([]);
  });

  it('la descarga con sesión vencida vuelve al ingreso sin enviar datos ni conservar la vista privada', async () => {
    const f = await matrix(1);
    await login('docente2');
    await open(f.group);
    const dialog = await review();
    const cookie = (await context.cookies()).find(
      (item) => item.name === COOKIE_NAME,
    )!;
    await source.query(
      "UPDATE sesiones_usuario SET creado_at=now()-interval '2 hours',expira_at=now()-interval '1 hour' WHERE token_hash=$1",
      [digest(cookie.value)],
    );
    sessions.delete('docente2');
    const denied = response(`${endpoint(f.group)}/exportaciones`, 'POST');
    await dialog
      .getByRole('button', { name: 'Generar XLSX', exact: true })
      .click();
    expect((await denied).status()).toBe(401);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).waitFor();
    await contains(page.locator('body'), 'Tu sesión terminó');
    expect(await page.locator('body').textContent()).not.toContain(
      f.students[0]!.nombre,
    );
    expect(
      await source.query('SELECT id FROM exportaciones WHERE grupo_id=$1', [
        f.group.id,
      ]),
    ).toEqual([]);
  });

  it('solo el resultado confirmado del acta actual aparece como condición y conteo confirmado', async () => {
    const f = await matrix(1, english, ['12.5']);
    const session = await fixture.session(f.group);
    expect(
      (
        await write(
          `asistencia/grupos/${f.group.id}/sesiones/${session.id}/asistencias`,
          {
            registros: [
              {
                matriculaId: f.enrollments[0]!.id,
                codigo: 'P',
                observacion: null,
                version: null,
              },
            ],
          },
          'docente',
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    const attendance = await (
      await read(`asistencia/grupos/${f.group.id}/cierre`)
    ).json();
    expect(
      (
        await write(`asistencia/grupos/${f.group.id}/cierre`, {
          revision: attendance.revision,
          confirmarPendientes: true,
        })
      ).status(),
    ).toBe(201);
    const act = await (
      await read(`evaluacion/grupos/${f.group.id}/acta`)
    ).json();
    expect(
      (
        await write(`evaluacion/grupos/${f.group.id}/acta`, {
          revision: act.revision,
          motivo: 'Cierre sintético B19',
        })
      ).status(),
    ).toBe(201);
    await login();
    await open(f.group);
    await fact(totals(), 'Aprobados confirmados', '1');
    await contains(matrixTable(), 'Aprobado');
    const { book } = await exportBook(f.group);
    expect(book.getWorksheet('Matriz')!.getCell('H10').value).toBe('Aprobado');
    // Otro intento conserva un resultado histórico sin procedencia B18. El acta
    // confirmada anterior permanece intacta y sus restricciones siguen activas.
    const legacy = await matrix(1, english, ['12.5']);
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,20,20,0,0,0,'APROBADO',now())",
      [legacy.enrollments[0]!.id],
    );
    await open(legacy.group);
    await fact(totals(), 'Aprobados confirmados', 'Pendiente');
    const row = matrixTable()
      .getByRole('row')
      .filter({ hasText: legacy.students[0]!.nombre });
    expect(
      await row.getByRole('cell', { name: 'Aprobado', exact: true }).count(),
    ).toBe(0);
    await contains(row, 'Pendiente');
  });
});
