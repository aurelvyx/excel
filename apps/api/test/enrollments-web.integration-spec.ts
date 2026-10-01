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
  throw new Error('Ejecutar B09 con pnpm test:db');
const password = 'Sintetica-B09-segura';
const artifacts = fileURLToPath(new URL('../../../.tmp/b09/', import.meta.url));

describe('B09 navegador React → API → PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let vite: ViteServer;
  let origin: string;
  const previousOrigins = process.env.WEB_ORIGINS;
  const errors: string[] = [];
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_enrollments_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_enrollments_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(
      source,
      'admin_enrollments_web',
      password,
    );
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    await seedDemo(source);
    await source.query(
      "UPDATE periodos_academicos SET estado='ABIERTO',matricula_inicio=CURRENT_DATE-1,matricula_fin=CURRENT_DATE+1",
    );
    await source.query("UPDATE grupos SET estado='ACTIVO'");
    await source.query(
      "INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado) SELECT g.periodo_id,n.id,g.turno_id,g.seccion_id,'DEMO-EN-G2','ACTIVO' FROM grupos g JOIN niveles n ON n.prerrequisito_id=g.nivel_id WHERE g.codigo='DEMO-EN-G1'",
    );
    const encoded = await hashPassword(password);
    const [person] = await source.query(
      "SELECT persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
    );
    for (const role of ['DOCENTE', 'SECRETARIA', 'COORDINADOR']) {
      const [user] = await source.query(
        'INSERT INTO usuarios (nombre_usuario,password_hash,requiere_cambio_clave,persona_id) VALUES ($1,$2,false,$3) RETURNING id',
        [
          role.toLowerCase(),
          encoded,
          role === 'DOCENTE' ? person.persona_id : null,
        ],
      );
      await source.query(
        'INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, admin.id, role],
      );
    }
    const [temporary] = await source.query(
      "INSERT INTO usuarios (nombre_usuario,password_hash) VALUES ('temporal_web',$1) RETURNING id",
      [encoded],
    );
    await source.query(
      "INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
      [temporary.id, admin.id],
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
    await browser?.close();
    await vite?.close();
    await app?.close();
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });
  async function login(user = 'admin_enrollments_web', secret = password) {
    await page.goto(origin);
    await page.getByLabel('Usuario', { exact: true }).fill(user);
    await page.getByLabel('Contraseña', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }

  let sequence = 0;
  async function student() {
    const code = `SYN-B09-${++sequence}`;
    const [person] = await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO',$1,'Alumno navegador','Sintético') RETURNING id",
      [code],
    );
    const [row] = await source.query(
      'INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,$2,CURRENT_DATE) RETURNING id',
      [person.id, code],
    );
    return { ...row, code };
  }
  async function start(owner: { id: string }) {
    await login('secretaria');
    await page.getByRole('link', { name: 'Matrículas', exact: true }).waitFor();
    await page.goto(`${origin}/#/matriculas?estudianteId=${owner.id}`);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Registrar o seleccionar voucher' })
      .waitFor();
  }
  async function registerVoucher(
    number = `SYN-B09-V-${++sequence}`,
    saved = true,
  ) {
    await page
      .getByRole('button', { name: 'Registrar voucher', exact: true })
      .click();
    await page.getByLabel('Número de voucher', { exact: true }).fill(number);
    await page.getByLabel('Fecha de pago', { exact: true }).fill('2026-09-30');
    await page.getByLabel('Importe', { exact: true }).fill('100.25');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    if (saved) await page.getByRole('dialog').waitFor({ state: 'hidden' });
    return number;
  }
  async function validateVoucher(number: string) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: number, exact: true }) });
    await row.getByRole('button', { name: 'Revisar voucher' }).click();
    await page.getByLabel('Decisión', { exact: true }).selectOption('VALIDADO');
    await page.getByRole('button', { name: 'Revisar decisión' }).click();
    await page
      .getByRole('button', { name: 'Confirmar decisión', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  async function chooseGroup(level = 'Nivel sintético 1') {
    await page
      .getByLabel('Periodo', { exact: true })
      .selectOption({ label: 'Periodo sintético B02' });
    await page
      .getByLabel('Idioma', { exact: true })
      .selectOption({ label: 'Inglés de prueba' });
    await page
      .getByLabel('Nivel', { exact: true })
      .selectOption({ label: level });
    await page
      .getByRole('button', { name: 'Seleccionar grupo', exact: true })
      .click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('heading', { name: 'Revisar y confirmar' }).waitFor();
  }
  async function preparePaid() {
    const owner = await student();
    await start(owner);
    const number = await registerVoucher();
    await validateVoucher(number);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await chooseGroup();
    await page.getByRole('checkbox').check();
    return owner;
  }
  it('registra estudiante y voucher, conserva pasos y confirma matrícula real en escritorio y móvil', async () => {
    await login('secretaria');
    await page.getByRole('link', { name: 'Matrículas', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar estudiante' }).click();
    const code = `SYN-B09-ALTA-${++sequence}`;
    await page.getByLabel('Tipo de documento').fill('SINTETICO');
    await page.getByLabel('Número de documento').fill(code);
    await page
      .getByRole('button', { name: 'Comprobar documento', exact: true })
      .click();
    await page.getByLabel('Código de estudiante').fill(code);
    await page.getByLabel('Fecha de registro').fill('2026-09-30');
    await page
      .getByLabel('Nombres', { exact: true })
      .fill('Alumno del asistente');
    await page.getByLabel('Apellido paterno').fill('Sintético');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const number = await registerVoucher();
    await validateVoucher(number);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await chooseGroup();
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    expect(
      await page.getByLabel('Nivel', { exact: true }).inputValue(),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    expect(
      await page
        .getByRole('region', { name: 'Contexto de matrícula' })
        .textContent(),
    ).toContain(number);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    expect(
      await page
        .getByRole('button', { name: 'Confirmar matrícula', exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.screenshot({
      path: `${artifacts}/confirmacion.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${artifacts}/confirmacion-movil.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Matrícula registrada' }).waitFor();
    expect(
      await source.query('SELECT estado FROM matriculas WHERE codigo LIKE $1', [
        `MAT-${code}-%`,
      ]),
    ).toEqual([{ estado: 'ACTIVA' }]);
    expect(errors).toEqual([]);
    await page
      .getByRole('button', { name: 'Nueva matrícula', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Seleccionar estudiante', exact: true })
      .waitFor();
    expect(
      await page
        .getByRole('region', { name: 'Contexto de matrícula' })
        .textContent(),
    ).not.toContain(number);
  }, 60000);
  it('guarda sin voucher y retoma desde historial con el mismo intento', async () => {
    const owner = await student();
    await start(owner);
    await page.getByRole('button', { name: 'Continuar sin voucher' }).click();
    await chooseGroup();
    await page
      .getByRole('button', { name: 'Guardar solicitud pendiente' })
      .click();
    await page.waitForURL('**/#/matriculas/*');
    const [before] = await source.query(
      'SELECT id,numero_intento FROM matriculas WHERE estudiante_id=$1',
      [owner.id],
    );
    await page.getByRole('link', { name: 'Ver ficha del estudiante' }).click();
    await page
      .getByRole('link', { name: 'Retomar solicitud', exact: true })
      .click();
    const number = await registerVoucher();
    await validateVoucher(number);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Matrícula registrada' }).waitFor();
    expect(
      await source.query(
        'SELECT id,numero_intento,estado FROM matriculas WHERE estudiante_id=$1',
        [owner.id],
      ),
    ).toEqual([{ ...before, estado: 'ACTIVA' }]);
  }, 60000);
  it('muestra prerrequisito incumplido y permite corregir grupo sin perder estudiante', async () => {
    const owner = await student();
    await start(owner);
    await page.getByRole('button', { name: 'Continuar sin voucher' }).click();
    await chooseGroup('Nivel sintético 2');
    await page
      .getByRole('button', { name: 'Guardar solicitud pendiente' })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Falta aprobar el nivel prerrequisito' })
      .waitFor();
    expect(
      await source.query('SELECT id FROM matriculas WHERE estudiante_id=$1', [
        owner.id,
      ]),
    ).toEqual([]);
    await page.screenshot({
      path: `${artifacts}/prerrequisito.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page
      .getByLabel('Nivel', { exact: true })
      .selectOption({ label: 'Nivel sintético 1' });
    await page.getByRole('button', { name: 'Seleccionar grupo' }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByRole('button', { name: 'Guardar solicitud pendiente' })
      .click();
    await page.waitForURL('**/#/matriculas/*');
    expect(
      await source.query(
        'SELECT estado FROM matriculas WHERE estudiante_id=$1',
        [owner.id],
      ),
    ).toEqual([{ estado: 'PENDIENTE' }]);
  });
  it('voucher pendiente no activa y un duplicado conserva los campos del formulario', async () => {
    const owner = await student();
    await start(owner);
    const number = await registerVoucher();
    await registerVoucher(number, false);
    await page
      .getByRole('alert')
      .filter({ hasText: 'voucher ya está registrado' })
      .waitFor();
    expect(await page.getByLabel('Importe', { exact: true }).inputValue()).toBe(
      '100.25',
    );
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await chooseGroup();
    expect(
      await page
        .getByRole('button', { name: 'Confirmar matrícula', exact: true })
        .count(),
    ).toBe(0);
    await page
      .getByRole('button', { name: 'Guardar solicitud pendiente' })
      .click();
    await page.waitForURL('**/#/matriculas/*');
    expect(
      await source.query(
        'SELECT estado,voucher_id FROM matriculas WHERE estudiante_id=$1',
        [owner.id],
      ),
    ).toEqual([{ estado: 'PENDIENTE', voucher_id: null }]);
  });
  it('fallo de activación deja pendiente y el reintento conserva un único intento', async () => {
    const owner = await preparePaid();
    let once = true;
    await page.route('**/api/v1/matriculas/*/activar', async (route) => {
      if (once) {
        once = false;
        await source.query(
          "UPDATE grupos SET estado='CERRADO' WHERE codigo='DEMO-EN-G1'",
        );
      }
      await route.continue();
    });
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'no admite matrículas' })
      .waitFor();
    const [pending] = await source.query(
      'SELECT id,estado FROM matriculas WHERE estudiante_id=$1',
      [owner.id],
    );
    expect(pending.estado).toBe('PENDIENTE');
    await source.query(
      "UPDATE grupos SET estado='ACTIVO' WHERE codigo='DEMO-EN-G1'",
    );
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Matrícula registrada' }).waitFor();
    expect(
      await source.query(
        'SELECT id,estado FROM matriculas WHERE estudiante_id=$1',
        [owner.id],
      ),
    ).toEqual([{ id: pending.id, estado: 'ACTIVA' }]);
  });
  it('respuesta de alta perdida se reintenta sin duplicar solicitud ni auditoría', async () => {
    const owner = await preparePaid();
    let once = true;
    await page.route('**/api/v1/matriculas', async (route) => {
      if (once && route.request().method() === 'POST') {
        once = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'No se pudo conectar' })
      .waitFor();
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Matrícula registrada' }).waitFor();
    expect(
      (
        await source.query(
          'SELECT count(*)::int AS n FROM matriculas WHERE estudiante_id=$1',
          [owner.id],
        )
      )[0].n,
    ).toBe(1);
  });
  it('respuesta de activación perdida se recupera consultando la matrícula', async () => {
    const owner = await preparePaid();
    await page.route('**/api/v1/matriculas/*/activar', async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await page
      .getByRole('button', { name: 'Confirmar matrícula', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Matrícula registrada' }).waitFor();
    expect(
      await source.query(
        'SELECT estado FROM matriculas WHERE estudiante_id=$1',
        [owner.id],
      ),
    ).toEqual([{ estado: 'ACTIVA' }]);
  });
  it('docente y coordinación no acceden al asistente', async () => {
    await login('coordinador');
    expect(
      await page.getByRole('link', { name: 'Matrículas', exact: true }).count(),
    ).toBe(0);
    await page.goto(`${origin}/#/matriculas`);
    await page.getByRole('heading', { name: 'Página no disponible' }).waitFor();
    expect(
      (await context.request.get(`${origin}/api/v1/matriculas/1`)).status(),
    ).toBe(403);
  });
});
