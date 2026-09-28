import { historyFixture } from './student-history.fixture.js';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { createServer, type AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B06 con pnpm test:db');
const password = 'Sintetica-B06-segura';
const webRoot = fileURLToPath(new URL('../../web/', import.meta.url));
const artifacts = fileURLToPath(new URL('../../../.tmp/b06/', import.meta.url));
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
type ViteServer = {
  listen: () => Promise<unknown>;
  close: () => Promise<void>;
};

describe('B06 navegador React → API → PostgreSQL', () => {
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
      await base.query('CREATE DATABASE excel_students_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_students_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(
      source,
      'admin_students_web',
      password,
    );
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    await seedDemo(source);
    const [studentPerson] = await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno,correo) VALUES('SINTETICO','B06-HISTORIA','Alumno histórico','Sintético','privado@example.invalid') RETURNING id",
    );
    const [student] = await source.query(
      "INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,'SYN-HISTORIA','2026-09-27') RETURNING id",
      [studentPerson.id],
    );
    await historyFixture(source, student.id, admin.id);
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
    const vitePath = createRequire(import.meta.url).resolve('vite', {
      paths: [webRoot],
    });
    const factory = (await import(pathToFileURL(vitePath).href)) as {
      createServer: (options: unknown) => Promise<ViteServer>;
    };
    vite = await factory.createServer({
      root: webRoot,
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        proxy: { '/api': await app.getUrl() },
      },
      logLevel: 'error',
    });
    await vite.listen();
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
  async function login(user = 'admin_students_web', secret = password) {
    await page.goto(origin);
    await page.getByLabel('Usuario', { exact: true }).fill(user);
    await page.getByLabel('Contraseña', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }
  it('secretaría registra, busca y edita con duplicado visible y conservación del contexto', async () => {
    await login('secretaria');
    await page.getByRole('link', { name: 'Estudiantes', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar estudiante' }).click();
    await page.getByLabel('Tipo de documento').fill('SINTETICO');
    await page.getByLabel('Número de documento').fill('B06-WEB-001');
    await page
      .getByRole('button', { name: 'Comprobar documento', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Código de estudiante').fill('SYN-WEB-001');
    await dialog.getByLabel('Fecha de registro').fill('2026-09-27');
    await dialog
      .getByLabel('Nombres', { exact: false })
      .fill('Alumno de navegador');
    await dialog.getByLabel('Apellido paterno').fill('Sintético');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('heading', { name: 'Ficha del estudiante' }).waitFor();
    await page
      .getByText('No hay intentos registrados para esta consulta.')
      .waitFor();
    await page.getByRole('button', { name: 'Editar estudiante' }).click();
    expect(await dialog.getByLabel('Número de documento').isDisabled()).toBe(
      true,
    );
    await dialog.getByLabel('Teléfono').fill('000000123');
    await dialog.getByLabel('Motivo').fill('Corrección sintética B06');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByText('000000123', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Volver a estudiantes' }).click();
    await page.getByLabel('Documento, código o nombre').fill('SYN-WEB-001');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.waitForURL('**/#/estudiantes?q=SYN-WEB-001');
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length === 1,
    );
    await page
      .getByRole('cell', { name: 'SYN-WEB-001', exact: true })
      .waitFor();
    expect(await page.locator('tbody tr').count()).toBe(1);
    await page.getByRole('button', { name: 'Registrar estudiante' }).click();
    await page.getByLabel('Tipo de documento').fill('SINTETICO');
    await page.getByLabel('Número de documento').fill('B06-WEB-001');
    await page
      .getByRole('button', { name: 'Comprobar documento', exact: true })
      .click();
    await page.getByText('Ya existe como estudiante: SYN-WEB-001.').waitFor();
    await page
      .getByRole('button', { name: 'Abrir estudiante existente' })
      .click();
    await page.getByRole('heading', { name: 'Ficha del estudiante' }).waitFor();
    await page
      .getByText('No hay intentos registrados para esta consulta.')
      .waitFor();
    await page.screenshot({ path: `${artifacts}/ficha.png`, fullPage: true });
  });
  it('coordinación consulta dos intentos y notas cero/pendiente sin edición ni contactos', async () => {
    await login('coordinador');
    await page.getByRole('link', { name: 'Estudiantes', exact: true }).click();
    await page.getByLabel('Documento, código o nombre').fill('SYN-HISTORIA');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.waitForURL('**/#/estudiantes?q=SYN-HISTORIA');
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length === 1,
    );
    await page.getByRole('link', { name: 'Ver ficha e historial' }).click();
    await page
      .getByRole('button', { name: 'Consultar intento 2', exact: true })
      .waitFor();
    expect(
      await page.getByRole('button', { name: 'Editar estudiante' }).count(),
    ).toBe(0);
    expect(await page.getByText('privado@example.invalid').count()).toBe(0);
    await page
      .getByRole('button', { name: 'Consultar intento 1', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('cell', { name: '12.40', exact: true })
      .first()
      .waitFor();
    await page
      .getByRole('button', { name: 'Cerrar formulario', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Consultar intento 2', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('cell', { name: '0.00', exact: true }).waitFor();
    await dialog
      .getByRole('cell', { name: 'Pendiente', exact: true })
      .waitFor();
    await page.screenshot({ path: `${artifacts}/intento.png`, fullPage: true });
    await page
      .getByRole('button', { name: 'Cerrar formulario', exact: true })
      .click();
    await page
      .getByLabel('Periodo', { exact: true })
      .selectOption({ label: 'Periodo segundo sintético' });
    await page
      .getByRole('button', { name: 'Consultar intento 1', exact: true })
      .waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Consultar intento 2', exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${artifacts}/movil.png`, fullPage: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  it('docente no accede a estudiantes desde navegación ni URL directa', async () => {
    await login('docente');
    await page
      .getByRole('link', { name: 'Mis grupos', exact: true })
      .first()
      .waitFor();
    expect(
      await page
        .getByRole('link', { name: 'Estudiantes', exact: true })
        .count(),
    ).toBe(0);
    await page.goto(`${origin}/#/estudiantes`);
    await page.getByRole('heading', { name: 'Página no disponible' }).waitFor();
  });
});
