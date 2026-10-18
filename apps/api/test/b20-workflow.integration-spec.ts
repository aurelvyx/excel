import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { hashPassword } from '../src/modules/auth/security.js';
import {
  createWebServer,
  freePort,
  type ViteServer,
} from './browser-server.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B20 mediante pnpm test:b20 o pnpm test:db');
const browserName = process.env.B20_BROWSER ?? 'chromium';
if (!['chromium', 'msedge'].includes(browserName))
  throw new Error('B20_BROWSER admite chromium o msedge');
const password = 'Sintetica-B20-recorrido';
const administrator = 'admin_b20';
const artifacts = fileURLToPath(new URL('../../../.tmp/b20/', import.meta.url));
type Group = { id: string; nivel_id: string; codigo: string };
type Student = { id: string; documento: string; nombre: string };
type Enrollment = {
  id: string;
  codigo: string;
  numero_intento: number;
  estado: string;
  voucher_id: string;
};

/** B20 / RNF09, RNF16: integración vertical sintética, no prueba piloto con personas. */
describe(`B20 recorrido académico integral (${browserName})`, () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
  let today: string;
  let sessionDates: string[];
  let sequence = 0;
  const userIds: Record<string, string> = {};
  const errors: string[] = [];
  const cookies = new Map<
    string,
    Awaited<ReturnType<BrowserContext['cookies']>>
  >();
  const previousOrigins = process.env.WEB_ORIGINS;

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_b20_workflow_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_b20_workflow_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(source, administrator, password);
    userIds[administrator] = admin.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    await seedDemo(source);
    const [dates] = await source.query(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS hoy,
       ARRAY(SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date-n)::text
       FROM generate_series(3,0,-1) n) AS sesiones`,
    );
    today = dates.hoy as string;
    sessionDates = dates.sesiones as string[];
    // Solo catálogo y cuentas se preparan directamente. Los registros académicos
    // del recorrido se crean por la interfaz y se verifican después en PostgreSQL.
    await source.query(
      `UPDATE periodos_academicos SET estado='ABIERTO',fecha_inicio=$1::date-10,
       fecha_fin=$1::date+60,matricula_inicio=$1::date-10,matricula_fin=$1::date+10`,
      [today],
    );
    await source.query("UPDATE grupos SET estado='ACTIVO'");
    const [teacher] = await source.query(
      "SELECT persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
    );
    const encoded = await hashPassword(password);
    for (const [name, role] of [
      ['docente_b20', 'DOCENTE'],
      ['secretaria_b20', 'SECRETARIA'],
      ['coordinador_b20', 'COORDINADOR'],
      ['ajeno_b20', 'DOCENTE'],
    ]) {
      const [user] = await source.query(
        'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave,persona_id) VALUES($1,$2,false,$3) RETURNING id',
        [name, encoded, name === 'docente_b20' ? teacher.persona_id : null],
      );
      userIds[name!] = user.id as string;
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, admin.id, role],
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
    browser = await chromium.launch(
      browserName === 'msedge' ? { channel: 'msedge' } : {},
    );
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      `${artifacts}entorno-${browserName}.json`,
      `${JSON.stringify(
        {
          navegador: browserName,
          version: browser.version(),
          viewport: { width: 1440, height: 1000 },
          datos: 'SINTETICOS',
          alcance: 'Recorridos automatizados B20, no piloto con participantes',
          registradoAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  }, 60000);
  beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    errors.length = 0;
    page.on('pageerror', (error) => errors.push(error.message));
  });
  afterEach(async ({ task }) => {
    if (task.result?.state === 'fail' && page && !page.isClosed())
      await page.screenshot({
        path: `${artifacts}fallo-${browserName}-${sequence}.png`,
        fullPage: true,
      });
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

  function response(path: string, method = 'GET') {
    return page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === `/api/v1/${path}` &&
        res.request().method() === method,
    );
  }
  async function contains(locator: Locator, text: string) {
    await expect.poll(() => locator.textContent()).toContain(text);
  }
  async function checkContext(group: Group) {
    const panel = page.getByRole('region', {
      name: 'Contexto del grupo',
      exact: true,
    });
    for (const value of [
      group.codigo,
      'Periodo sintético B02',
      'Nivel sintético 1',
      group.codigo.includes('-PT-')
        ? 'Portugués de prueba'
        : 'Inglés de prueba',
    ])
      await contains(panel, value);
  }
  async function login(name: string) {
    await context.clearCookies();
    const saved = cookies.get(name);
    if (saved) await context.addCookies(saved);
    await page.goto(origin);
    if (!saved) {
      await page.getByLabel('Usuario', { exact: true }).fill(name);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      const logged = response('auth/login', 'POST');
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      expect((await logged).status()).toBe(200);
    }
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .waitFor();
    if (!saved) cookies.set(name, await context.cookies());
  }
  async function write(path: string, data: unknown, method = 'POST') {
    const current = await context.request.get(`${origin}/api/v1/auth/me`);
    expect(current.status()).toBe(200);
    const { csrfToken } = await current.json();
    return context.request.fetch(`${origin}/api/v1/${path}`, {
      method,
      data,
      headers: {
        Origin: origin,
        'X-Requested-With': 'Excel-Web',
        'X-CSRF-Token': csrfToken as string,
      },
    });
  }
  async function prepareGroup(
    language: 'EN' | 'PT',
    repeat = false,
  ): Promise<Group> {
    let group: Group;
    if (!repeat) {
      [group] = await source.query(
        'SELECT id,nivel_id,codigo FROM grupos WHERE codigo=$1',
        [`DEMO-${language}-G1`],
      );
    } else {
      [group] = await source.query(
        `INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
         SELECT periodo_id,nivel_id,turno_id,seccion_id,$1,'ACTIVO' FROM grupos WHERE codigo=$2
         RETURNING id,nivel_id,codigo`,
        [`SYN-B20-${language}-REPETICION`, `DEMO-${language}-G1`],
      );
    }
    await login(administrator);
    const created = await write(
      `evaluacion/niveles/${group!.nivel_id}/planes`,
      {
        nombre: `Plan sintético B20 ${++sequence}`,
        formula: 'PONDERADA_JERARQUICA_V1',
        estructura: {
          evaluaciones: [
            {
              nombre: 'Evaluación sintética B20',
              unidadId: null,
              pesoPct: '100',
              orden: 1,
              indicadores: [
                {
                  codigo: 'SYN-B20',
                  descripcion: 'Indicador sintético del recorrido',
                  pesoPct: '100',
                  orden: 1,
                },
              ],
            },
          ],
        },
      },
    );
    expect(created.status()).toBe(201);
    const { plan } = await created.json();
    expect(
      (
        await write(`evaluacion/planes/${plan.id}/aprobacion`, {
          revision: plan.revision,
          confirmado: true,
          referenciaAprobacion:
            'Configuración sintética B20, no aprobación institucional',
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await write(`evaluacion/grupos/${group!.id}/configuracion`, {
          planId: plan.id,
          confirmado: true,
        })
      ).status(),
    ).toBe(201);
    return group!;
  }
  async function enrollment(
    group: Group,
    language: 'EN' | 'PT',
    existing?: Student,
  ) {
    await login('secretaria_b20');
    await page.goto(
      `${origin}/#/matriculas${existing ? `?estudianteId=${existing.id}` : ''}`,
    );
    let student = existing;
    if (!student) {
      await page
        .getByRole('button', { name: 'Registrar estudiante', exact: true })
        .click();
      const document = `SYN-B20-${language}-${++sequence}`;
      const names = `Alumno B20 ${language}`;
      await page
        .getByLabel('Tipo de documento', { exact: true })
        .fill('SINTETICO');
      await page
        .getByLabel('Número de documento', { exact: true })
        .fill(document);
      await page
        .getByRole('button', { name: 'Comprobar documento', exact: true })
        .click();
      await page
        .getByLabel('Código de estudiante', { exact: true })
        .fill(document);
      await page.getByLabel('Fecha de registro', { exact: true }).fill(today);
      await page.getByLabel('Nombres', { exact: true }).fill(names);
      await page
        .getByLabel('Apellido paterno', { exact: true })
        .fill('Sintético');
      await page
        .getByRole('button', { name: 'Revisar cambios', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirmar y guardar', exact: true })
        .click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const [persisted] = await source.query(
        'SELECT e.id FROM estudiantes e JOIN personas p ON p.id=e.persona_id WHERE p.numero_documento=$1',
        [document],
      );
      student = {
        id: persisted.id as string,
        documento: document,
        nombre: `Sintético ${names}`,
      };
    }
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByRole('heading', {
        name: 'Registrar o seleccionar voucher',
        exact: true,
      })
      .waitFor();
    // Teclado y restauración de foco del modal común, sin alterar el formulario.
    const registerVoucher = page.getByRole('button', {
      name: 'Registrar voucher',
      exact: true,
    });
    await registerVoucher.focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expect
      .poll(() =>
        registerVoucher.evaluate(
          (element) => document.activeElement === element,
        ),
      )
      .toBe(true);
    await page.keyboard.press('Enter');
    const voucher = `SYN-B20-V-${++sequence}`;
    await page.getByLabel('Número de voucher', { exact: true }).fill(voucher);
    await page.getByLabel('Fecha de pago', { exact: true }).fill(today);
    await page.getByLabel('Importe', { exact: true }).fill('100.25');
    await page
      .getByRole('button', { name: 'Revisar cambios', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar y guardar', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const voucherRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: voucher, exact: true }) });
    await voucherRow
      .getByRole('button', { name: 'Revisar voucher', exact: true })
      .click();
    await page.getByLabel('Decisión', { exact: true }).selectOption('VALIDADO');
    await page
      .getByRole('button', { name: 'Revisar decisión', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar decisión', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    expect(
      await source.query(
        'SELECT id FROM matriculas WHERE estudiante_id=$1 AND grupo_id=$2',
        [student.id, group.id],
      ),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByLabel('Periodo', { exact: true })
      .selectOption({ label: 'Periodo sintético B02' });
    await page.getByLabel('Idioma', { exact: true }).selectOption({
      label: language === 'EN' ? 'Inglés de prueba' : 'Portugués de prueba',
    });
    await page
      .getByLabel('Nivel', { exact: true })
      .selectOption({ label: 'Nivel sintético 1' });
    const selectedGroup = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: group.codigo, exact: true }),
    });
    await selectedGroup
      .getByRole('button', { name: 'Seleccionar grupo', exact: true })
      .click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Revisar y confirmar', exact: true })
      .waitFor();
    await contains(
      page.getByRole('region', { name: 'Contexto de matrícula', exact: true }),
      group.codigo,
    );
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('heading', { name: 'Matrícula registrada', exact: true })
      .waitFor();
    const [saved] = (await source.query(
      'SELECT id,codigo,numero_intento,estado,voucher_id FROM matriculas WHERE estudiante_id=$1 AND grupo_id=$2',
      [student.id, group.id],
    )) as Enrollment[];
    expect(saved).toMatchObject({
      estado: 'ACTIVA',
      numero_intento: existing ? 2 : 1,
    });
    const prefix = `MAT-${student.documento}-`;
    expect(saved!.codigo.startsWith(prefix)).toBe(true);
    expect(saved!.codigo.slice(prefix.length)).toMatch(/^[1-9][0-9]*$/);
    expect(
      await source.query(
        'SELECT numero,estado,validado_por,importe FROM vouchers WHERE id=$1',
        [saved!.voucher_id],
      ),
    ).toEqual([
      {
        numero: voucher,
        estado: 'VALIDADO',
        validado_por: userIds.secretaria_b20,
        importe: '100.25',
      },
    ]);
    return { student, enrollment: saved! };
  }
  async function programAndMark(group: Group, owner: Student) {
    await login('docente_b20');
    await page.goto(`${origin}/#/asistencia/grupos/${group.id}`);
    await page
      .getByRole('heading', { name: 'Sesiones de clase', exact: true })
      .waitFor();
    await checkContext(group);
    await page
      .getByRole('button', { name: 'Programar sesiones', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    for (const date of sessionDates) {
      await dialog.getByLabel('Fecha de clase', { exact: true }).fill(date);
      await dialog
        .getByRole('button', { name: 'Añadir fecha', exact: true })
        .click();
    }
    await dialog
      .getByRole('button', { name: 'Revisar programación', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Confirmar programación', exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    const sessions = (await source.query(
      'SELECT id,fecha::text FROM sesiones_clase WHERE grupo_id=$1 ORDER BY fecha',
      [group.id],
    )) as { id: string; fecha: string }[];
    expect(sessions.map((session) => session.fecha)).toEqual(sessionDates);
    for (const [index, session] of sessions.entries()) {
      const path = `asistencia/grupos/${group.id}/sesiones/${session.id}/asistencias`;
      const loaded = response(path);
      await page.goto(
        `${origin}/#/asistencia/grupos/${group.id}/sesiones/${session.id}`,
      );
      expect((await loaded).status()).toBe(200);
      await checkContext(group);
      await page
        .getByLabel(`Asistencia de ${owner.nombre}`, { exact: true })
        .selectOption(index === 3 ? 'J' : 'T');
      const saved = response(path, 'PATCH');
      await page
        .getByRole('button', { name: 'Guardar asistencia', exact: true })
        .click();
      expect((await saved).status()).toBe(200);
      await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
      // El aviso precede a la reconsulta del resumen; hasta terminarla la
      // navegación se bloquea correctamente para proteger la captura.
      await expect
        .poll(() =>
          page
            .getByRole('button', { name: 'Guardar asistencia', exact: true })
            .getAttribute('aria-busy'),
        )
        .toBe(null);
    }
  }
  async function recover(group: Group, owner: Student) {
    const path = `asistencia/grupos/${group.id}/justificaciones`;
    await login('secretaria_b20');
    await page.goto(`${origin}/#/${path}`);
    await page
      .getByRole('table', { name: 'Justificaciones del grupo', exact: true })
      .waitFor();
    const row = () =>
      page.getByRole('row').filter({
        has: page.getByText(`SINTETICO ${owner.documento}`, { exact: true }),
      });
    await row()
      .getByRole('button', { name: 'Registrar justificación', exact: true })
      .click();
    let dialog = page.getByRole('dialog', {
      name: 'Registrar justificación',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo', { exact: true })
      .fill('Solicitud sintética de recuperación B20');
    await dialog
      .getByLabel('Fecha de presentación', { exact: true })
      .fill(today);
    await dialog
      .getByRole('button', { name: 'Revisar solicitud', exact: true })
      .click();
    const created = response(path, 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar solicitud', exact: true })
      .click();
    expect((await created).status()).toBe(201);
    await dialog.waitFor({ state: 'hidden' });
    await row()
      .getByRole('button', { name: 'Resolver justificación', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Resolver justificación',
      exact: true,
    });
    await dialog
      .getByLabel('Decisión', { exact: true })
      .selectOption('APROBADA');
    await dialog
      .getByLabel('Observación de resolución', { exact: true })
      .fill('Resolución sintética B20');
    await dialog
      .getByRole('button', { name: 'Revisar resolución', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    await page.getByText('Resolución registrada.', { exact: true }).waitFor();
    await login('docente_b20');
    await page.goto(`${origin}/#/${path}`);
    await row()
      .getByRole('button', { name: 'Confirmar recuperación', exact: true })
      .click();
    dialog = page.getByRole('dialog', {
      name: 'Confirmar recuperación',
      exact: true,
    });
    await dialog
      .getByLabel('Resultado de recuperación', { exact: true })
      .selectOption('RECUPERADA');
    await dialog
      .getByLabel('Observación de recuperación', { exact: true })
      .fill('Clase sintética recuperada B20');
    await dialog
      .getByRole('button', { name: 'Revisar recuperación', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Confirmar recuperación', exact: true })
      .click();
    await page.getByText('Recuperación registrada.', { exact: true }).waitFor();
    await contains(row(), '25,00 %');
  }
  async function grade(group: Group, owner: Student, note: string) {
    const path = `evaluacion/grupos/${group.id}/calificaciones`;
    await page.goto(`${origin}/#/${path}`);
    await page
      .getByLabel(`Nota SYN-B20 de ${owner.nombre}`, { exact: true })
      .fill(note);
    const saved = response(path, 'PATCH');
    await page
      .getByRole('button', { name: 'Guardar calificaciones', exact: true })
      .click();
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
  async function close(group: Group) {
    await login(administrator);
    await page.goto(`${origin}/#/asistencia/grupos/${group.id}/cierre`);
    await page
      .getByRole('button', { name: 'Cerrar asistencia', exact: true })
      .click();
    let dialog = page.getByRole('dialog', {
      name: 'Cerrar asistencia',
      exact: true,
    });
    await dialog
      .getByLabel('Motivo del cierre', { exact: true })
      .fill('Cierre sintético integral B20');
    // El recorrido recuperó su única J y no dejó marcas pendientes; la
    // confirmación adicional solo se presenta cuando hay advertencias.
    expect(
      await dialog
        .getByLabel('Confirmo que revisé los pendientes y las advertencias', {
          exact: true,
        })
        .count(),
    ).toBe(0);
    await dialog
      .getByRole('button', { name: 'Revisar cierre', exact: true })
      .click();
    const attendance = response(`asistencia/grupos/${group.id}/cierre`, 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre', exact: true })
      .click();
    expect((await attendance).status()).toBe(201);
    await dialog.waitFor({ state: 'hidden' });
    await page.goto(`${origin}/#/evaluacion/grupos/${group.id}/acta`);
    await page
      .getByRole('button', { name: 'Cerrar acta', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Cerrar acta', exact: true });
    await dialog
      .getByLabel('Motivo del cierre de acta', { exact: true })
      .fill('Acta sintética del recorrido B20');
    await dialog
      .getByLabel(
        'Confirmo que revisé los datos y la consecuencia de esta acción',
        { exact: true },
      )
      .check();
    await dialog
      .getByRole('button', { name: 'Revisar cierre de acta', exact: true })
      .click();
    const act = response(`evaluacion/grupos/${group.id}/acta`, 'POST');
    await dialog
      .getByRole('button', { name: 'Confirmar cierre de acta', exact: true })
      .click();
    expect((await act).status()).toBe(201);
    await page
      .getByText('Acta cerrada y resultados confirmados.', { exact: true })
      .waitFor();
    await dialog.waitFor({ state: 'hidden' });
  }
  async function exportWorkbook(group: Group, type: string) {
    const path = `reportes/grupos/${group.id}`;
    await page.goto(`${origin}/#/${path}?tipo=${type}`);
    await page
      .getByRole('region', { name: 'Resumen del grupo completo', exact: true })
      .waitFor();
    await checkContext(group);
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
    const downloaded = page.waitForEvent('download');
    const generated = response(`${path}/exportaciones`, 'POST');
    await dialog
      .getByRole('button', { name: 'Generar XLSX', exact: true })
      .click();
    expect((await generated).status()).toBe(201);
    const file = await downloaded;
    await file.saveAs(
      `${artifacts}BORRADOR-${browserName}-${group.codigo}-${type}.xlsx`,
    );
    const bytes = await readFile((await file.path())!);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(bytes).buffer);
    await contains(
      page.getByRole('region', {
        name: 'Historial de exportaciones',
        exact: true,
      }),
      file.suggestedFilename(),
    );
    return book;
  }
  async function academicSnapshot(enrollmentId: string) {
    return source.query(
      `SELECT m.id,m.codigo,m.estado,m.numero_intento,m.voucher_id,
       (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM asistencias a WHERE a.matricula_id=m.id) asistencias,
       (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM calificaciones c WHERE c.matricula_id=m.id) notas,
       (SELECT to_jsonb(r) FROM resultados_academicos r WHERE r.matricula_id=m.id) resultado
       FROM matriculas m WHERE m.id=$1`,
      [enrollmentId],
    );
  }

  for (const language of ['EN', 'PT'] as const)
    it(`${language}: matrícula → T/T/T/J recuperada → notas → acta → XLSX con roles reales${language === 'EN' ? ' → repetición sin alterar historial' : ''}`, async () => {
      const group = await prepareGroup(language);
      const { student, enrollment: first } = await enrollment(group, language);
      await programAndMark(group, student);
      await recover(group, student);
      const note = language === 'EN' ? '12.4' : '12.5';
      const official = language === 'EN' ? 12 : 13;
      const condition = language === 'EN' ? 'DESAPROBADO' : 'APROBADO';
      await grade(group, student, note);
      expect(
        await source.query(
          'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
          [first.id],
        ),
      ).toEqual([]);
      await close(group);
      await page.screenshot({
        path: `${artifacts}recorrido-${browserName}-${language}-acta.png`,
        fullPage: true,
      });
      const [result] = await source.query(
        'SELECT nota_oficial,condicion,tardanzas_total,faltas_equivalentes,inasistencia_pct,version FROM resultados_academicos WHERE matricula_id=$1',
        [first.id],
      );
      expect(result).toMatchObject({
        nota_oficial: official,
        condicion: condition,
        tardanzas_total: 3,
        faltas_equivalentes: '1.00',
        inasistencia_pct: '25.00',
        version: 1,
      });
      expect(
        await source.query(
          `SELECT a.codigo,j.estado,j.registrado_por,j.resuelto_por,j.recuperacion_confirmada_por
         FROM asistencias a JOIN justificaciones j ON j.asistencia_id=a.id WHERE a.matricula_id=$1`,
          [first.id],
        ),
      ).toEqual([
        {
          codigo: 'J',
          estado: 'RECUPERADA',
          registrado_por: userIds.secretaria_b20,
          resuelto_por: userIds.secretaria_b20,
          recuperacion_confirmada_por: userIds.docente_b20,
        },
      ]);

      await login('docente_b20');
      await page.goto(
        `${origin}/#/evaluacion/grupos/${group.id}/calificaciones`,
      );
      await contains(page.getByRole('main'), 'Solo lectura');
      await checkContext(group);
      expect(
        await page
          .getByLabel(`Nota SYN-B20 de ${student.nombre}`, { exact: true })
          .count(),
      ).toBe(0);
      const [indicator] = await source.query(
        'SELECT indicador_id FROM calificaciones WHERE matricula_id=$1',
        [first.id],
      );
      expect(
        (
          await write(
            `evaluacion/grupos/${group.id}/calificaciones`,
            {
              registros: [
                {
                  matriculaId: first.id,
                  indicadorId: indicator.indicador_id,
                  nota: '20',
                  version: 1,
                },
              ],
            },
            'PATCH',
          )
        ).status(),
      ).toBe(409);
      await login('ajeno_b20');
      expect(
        (
          await context.request.get(
            `${origin}/api/v1/reportes/grupos/${group.id}?tipo=MATRIZ_NOTAS`,
          )
        ).status(),
      ).toBe(403);
      await login('coordinador_b20');
      const matrix = await exportWorkbook(group, 'MATRIZ_NOTAS');
      const sheet = matrix.getWorksheet('Matriz')!;
      const firstRow = language === 'EN' ? 10 : 9;
      expect(sheet.getCell('A2').text).toContain('BORRADOR');
      expect(sheet.getCell(`B${firstRow}`).text).toContain(student.documento);
      expect(sheet.getCell(`D${firstRow}`).value).toBe(Number(note));
      expect(sheet.getCell(`F${firstRow}`).value).toBe(official);
      expect(sheet.getCell(`G${firstRow}`).value).toBe(0.25);
      expect(sheet.getCell(`H${firstRow}`).value).toBe(
        language === 'EN' ? 'Desaprobado' : 'Aprobado',
      );
      const summary = await exportWorkbook(group, 'RESUMEN_PARTICIPANTES');
      expect(summary.getWorksheet('ANEXO N° 05')!.getCell('K11').value).toBe(1);
      expect(summary.getWorksheet('ANEXO N° 05')!.getCell('L11').value).toBe(
        language === 'EN' ? 0 : 1,
      );
      expect(
        await source.query(
          'SELECT usuario_id,modo,filas FROM exportaciones WHERE grupo_id=$1 ORDER BY id',
          [group.id],
        ),
      ).toEqual([
        { usuario_id: userIds.coordinador_b20, modo: 'BORRADOR', filas: 1 },
        { usuario_id: userIds.coordinador_b20, modo: 'BORRADOR', filas: 1 },
      ]);
      await page.screenshot({
        path: `${artifacts}recorrido-${browserName}-${language}-reporte.png`,
        fullPage: true,
      });
      const audits = await source.query(
        'SELECT DISTINCT usuario_id FROM auditoria_eventos WHERE usuario_id=ANY($1::bigint[])',
        [Object.values(userIds).filter((id) => id !== userIds.ajeno_b20)],
      );
      expect(audits).toHaveLength(4);

      if (language === 'EN') {
        const original = await academicSnapshot(first.id);
        const repeat = await prepareGroup(language, true);
        const { enrollment: second } = await enrollment(
          repeat,
          language,
          student,
        );
        expect(second.id).not.toBe(first.id);
        expect(second.codigo).not.toBe(first.codigo);
        expect(second.voucher_id).not.toBe(first.voucher_id);
        expect(second.numero_intento).toBe(2);
        expect(
          await source.query(
            'SELECT id FROM asistencias WHERE matricula_id=$1 UNION ALL SELECT id FROM calificaciones WHERE matricula_id=$1 UNION ALL SELECT id FROM resultados_academicos WHERE matricula_id=$1',
            [second.id],
          ),
        ).toEqual([]);
        expect(await academicSnapshot(first.id)).toEqual(original);
        await page.goto(`${origin}/#/estudiantes/${student.id}`);
        await contains(
          page.getByRole('table', { name: 'Intentos académicos', exact: true }),
          second.codigo,
        );
        await contains(
          page.getByRole('table', { name: 'Intentos académicos', exact: true }),
          first.codigo,
        );
      }
    }, 90000);
});
