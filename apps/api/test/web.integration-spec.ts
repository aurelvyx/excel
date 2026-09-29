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
  throw new Error('Ejecutar B05 con pnpm test:db');
const password = 'Sintetica-B05-segura';
const artifacts = fileURLToPath(new URL('../../../.tmp/b05/', import.meta.url));

describe('B05 navegador React → API → PostgreSQL', () => {
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
      await base.query('CREATE DATABASE excel_web_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_web_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const admin = await bootstrapAdministrator(source, 'admin_web', password);
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [admin.id],
    );
    await seedDemo(source);
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
  async function login(user = 'admin_web', secret = password) {
    await page.goto(origin);
    await page.getByLabel('Usuario', { exact: true }).fill(user);
    await page.getByLabel('Contraseña', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  }
  async function screen(key: string) {
    await page.goto(`${origin}/#/configuracion/${key}`);
    await page
      .getByRole('button', { name: /^Crear / })
      .waitFor({ state: 'visible' });
    await page.waitForFunction(
      () =>
        !document.querySelector<HTMLButtonElement>('main .page-heading button')
          ?.disabled,
    );
  }
  async function create(
    key: string,
    fields: Record<string, string>,
    selects: Record<string, string> = {},
  ) {
    await screen(key);
    await page.getByRole('button', { name: /^Crear / }).click();
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries(fields))
      await dialog.getByLabel(label, { exact: false }).fill(value);
    for (const [label, value] of Object.entries(selects))
      await dialog
        .getByLabel(label, { exact: false })
        .selectOption({ label: value });
  }
  async function save() {
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }

  it('registra toda la configuración, asigna docente y persiste cambios desde la interfaz', async () => {
    await login();
    await page.getByRole('heading', { name: 'Hola, admin_web' }).waitFor();
    await page.screenshot({ path: `${artifacts}/inicio.png`, fullPage: true });
    await create('idiomas', { Código: 'B05-EN', Nombre: 'Idioma B05' });
    await save();
    await create(
      'niveles',
      { Código: 'B05-N1', Nombre: 'Nivel B05', Orden: '1' },
      { Idioma: 'B05-EN · Idioma B05' },
    );
    await save();
    await create(
      'unidades',
      {
        Código: 'B05-U1',
        Nombre: 'Unidad B05',
        Créditos: '1.5',
        'Horas teóricas': '2',
        'Horas prácticas': '3',
        Orden: '1',
      },
      { Nivel: 'Idioma B05 / B05-N1 · Nivel B05' },
    );
    await save();
    await create(
      'periodos',
      {
        Código: 'B05-P',
        Nombre: 'Periodo B05',
        'Inicio de clases': '2026-10-01',
        'Fin de clases': '2026-12-31',
        'Inicio de matrícula': '2026-09-01',
        'Fin de matrícula': '2026-10-01',
      },
      { Estado: 'Abierto' },
    );
    await save();
    await create('turnos', {
      Nombre: 'Turno B05',
      'Hora de inicio': '09:00',
      'Hora de fin': '11:00',
    });
    await save();
    await create('secciones', { Código: 'B05-A', Nombre: 'Sección B05' });
    await save();
    await create(
      'grupos',
      { Código: 'B05-G', Capacidad: '20' },
      {
        Periodo: 'B05-P · Periodo B05',
        Nivel: 'Idioma B05 / B05-N1 · Nivel B05',
        Turno: 'Turno B05',
        Sección: 'B05-A · Sección B05',
        Estado: 'Activo',
      },
    );
    await save();
    await create('docentes', {
      'Código docente': 'B05-DOC',
      'Tipo de documento': 'SINTETICO',
      'Número de documento': 'B05-DOC-001',
      Nombres: 'Persona B05',
      'Apellido paterno': 'Prueba',
      Correo: 'sintetico@example.test',
    });
    await save();
    await screen('grupos');
    await page
      .getByRole('row')
      .filter({ hasText: 'B05-G' })
      .getByRole('button', { name: 'Asignar docentes' })
      .click();
    await page
      .getByRole('button', { name: 'Asignar docente', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Docente', exact: false })
      .selectOption({ label: 'B05-DOC · Persona B05 Prueba' });
    await page.getByLabel('Fecha de asignación').fill('2026-09-26');
    await page.getByLabel('Motivo del cambio').fill('Asignación sintética B05');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByText('Asignación guardada.').waitFor();
    await page.getByLabel('Cerrar formulario').click();
    await create(
      'usuarios',
      { Usuario: 'docente_b05', 'Contraseña temporal': password },
      { 'Persona docente': 'B05-DOC · Persona B05 Prueba' },
    );
    await page.getByRole('checkbox', { name: 'Docente', exact: true }).check();
    await save();
    const [result] = await source.query(
      "SELECT u.persona_id,d.id FROM usuarios u JOIN docentes d ON d.persona_id=u.persona_id WHERE u.nombre_usuario='docente_b05'",
    );
    expect(result.persona_id).toBeTruthy();
    const assignments = await source.query(
      'SELECT * FROM grupo_docentes WHERE docente_id=$1',
      [result.id],
    );
    expect(assignments).toHaveLength(1);
    await screen('idiomas');
    await page
      .getByRole('row')
      .filter({ hasText: 'B05-EN' })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('Nombre')
      .fill('Idioma B05 corregido');
    await page.getByLabel('Motivo del cambio').fill('Corrección sintética');
    await save();
    await page.reload();
    await page
      .getByRole('cell', { name: 'Idioma B05 corregido', exact: true })
      .waitFor();
    await page.screenshot({
      path: `${artifacts}/configuracion.png`,
      fullPage: true,
    });
    const [event] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE motivo='Corrección sintética' ORDER BY id DESC LIMIT 1",
    );
    expect(event.valor_anterior.nombre).toBe('Idioma B05');
    expect(event.valor_nuevo.nombre).toBe('Idioma B05 corregido');
  }, 90000);

  it('conserva datos ante conflicto, valida campos y confirma la inactivación', async () => {
    await login();
    await create('idiomas', { Código: 'DEMO-EN', Nombre: 'Duplicado B05' });
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('alert').filter({ hasText: 'ya existe' }).waitFor();
    expect(
      await page.getByRole('dialog').getByLabel('Nombre').inputValue(),
    ).toBe('Duplicado B05');
    await page.getByRole('dialog').getByLabel('Nombre').fill(' ');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    expect(
      await page.getByText('Completa este campo.').count(),
    ).toBeGreaterThan(0);
    const invalidName = page.getByRole('dialog').getByLabel('Nombre');
    expect(await invalidName.getAttribute('aria-invalid')).toBe('true');
    expect(
      await invalidName.evaluate((input) => {
        const ids = input.getAttribute('aria-describedby')?.split(' ') ?? [];
        return ids.some(
          (id) =>
            document.getElementById(id)?.textContent === 'Completa este campo.',
        );
      }),
    ).toBe(true);
    await page.getByLabel('Cerrar formulario').click();
    expect(
      await page
        .getByRole('button', { name: 'Crear idioma', exact: true })
        .evaluate((button) => button === document.activeElement),
    ).toBe(true);
    await page
      .getByRole('row')
      .filter({ hasText: 'DEMO-EN' })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await page.getByRole('dialog').getByLabel('Estado').selectOption('false');
    await page
      .getByLabel('Motivo del cambio')
      .fill('Inactivación sintética B05');
    await page.getByRole('button', { name: 'Revisar cambios' }).click();
    await page
      .getByText('Este cambio deja el registro inactivo o cerrado.', {
        exact: false,
      })
      .waitFor();
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByLabel('Estado', { exact: true }).selectOption('false');
    await page
      .getByRole('row')
      .filter({ hasText: 'DEMO-EN' })
      .getByText('Inactivo', { exact: true })
      .waitFor();
  });

  it('cambia contraseña temporal y exige volver a ingresar; logout invalida sesión', async () => {
    await login('temporal_web');
    await page
      .getByRole('heading', { name: 'Cambia tu contraseña temporal' })
      .waitFor();
    expect(await page.getByRole('navigation').count()).toBe(0);
    await page.getByLabel('Contraseña actual').fill(password);
    await page
      .getByLabel('Nueva contraseña', { exact: true })
      .fill(`${password}-nueva`);
    await page.getByLabel('Repetir nueva contraseña').fill(`${password}-otra`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await page.getByText('Las contraseñas no coinciden.').waitFor();
    await page.getByLabel('Repetir nueva contraseña').fill(`${password}-nueva`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await page.getByRole('heading', { name: 'Ingresa a tu cuenta' }).waitFor();
    await login('temporal_web', `${password}-nueva`);
    await page.getByRole('heading', { name: 'Hola, temporal_web' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Hola, temporal_web' }).waitFor();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === 'excel_session',
      )?.httpOnly,
    ).toBe(true);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('heading', { name: 'Ingresa a tu cuenta' }).waitFor();
    expect((await page.request.get(`${origin}/api/v1/auth/me`)).status()).toBe(
      401,
    );
  });

  it('menú docente y consulta solo de grupos asignados, con contexto legible', async () => {
    await login('docente');
    await page.getByRole('link', { name: 'Ver mis grupos' }).click();
    await page.getByRole('cell', { name: 'DEMO-EN-G1', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: /^Crear / }).count()).toBe(0);
    expect(
      await page.getByRole('link', { name: 'Usuarios y roles' }).count(),
    ).toBe(0);
    expect(
      await page.getByRole('row').filter({ hasText: 'B05-G' }).count(),
    ).toBe(0);
    await page
      .getByRole('row')
      .filter({ hasText: 'DEMO-EN-G1' })
      .getByRole('button', { name: 'Ver detalle' })
      .click();
    await page
      .getByRole('dialog')
      .getByText('Inglés de prueba / Nivel sintético 1', { exact: true })
      .waitFor();
    await page.getByLabel('Cerrar formulario').click();
    await page.goto(`${origin}/#/configuracion/usuarios`);
    await page.getByRole('heading', { name: 'Página no disponible' }).waitFor();
    expect((await page.request.get(`${origin}/api/v1/usuarios`)).status()).toBe(
      403,
    );
    await source.query(
      "UPDATE sesiones_usuario SET creado_at=CURRENT_TIMESTAMP-interval '1 hour', expira_at=CURRENT_TIMESTAMP-interval '1 second' WHERE usuario_id=(SELECT id FROM usuarios WHERE nombre_usuario='docente')",
    );
    await page.reload();
    await page.getByRole('heading', { name: 'Ingresa a tu cuenta' }).waitFor();
  });

  it.each(['secretaria', 'coordinador'])(
    'consulta de %s sin edición y menú adaptable',
    async (role) => {
      await login(role);
      await page.getByRole('heading', { name: `Hola, ${role}` }).waitFor();
      await page
        .getByRole('navigation')
        .getByRole('link', { name: 'Idiomas', exact: true })
        .click();
      await page.getByText('Solo lectura ·', { exact: false }).waitFor();
      expect(
        await page.getByRole('button', { name: /^Crear |^Editar/ }).count(),
      ).toBe(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Menú', exact: true }).click();
      await page
        .getByRole('navigation')
        .getByRole('link', { name: 'Periodos académicos' })
        .click();
      await page
        .getByRole('heading', { name: 'Periodos académicos' })
        .waitFor();
      expect(
        await page
          .getByRole('button', { name: 'Menú', exact: true })
          .getAttribute('aria-expanded'),
      ).toBe('false');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (role === 'secretaria')
        await page.screenshot({
          path: `${artifacts}/movil.png`,
          fullPage: true,
        });
    },
  );

  it('muestra error de credenciales sin revelar cuentas y permite reintentar conexión', async () => {
    await login('inexistente_b05', 'incorrecta');
    await page.getByText('Usuario o contraseña incorrectos.').waitFor();
    await page.screenshot({ path: `${artifacts}/acceso.png`, fullPage: true });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.getByText('No se pudo conectar.', { exact: false }).waitFor();
    await context.setOffline(false);
  });
  it('crea usuario sin persona, modifica roles y pagina conservando filtros', async () => {
    await login();
    await create('usuarios', {
      Usuario: 'cuenta_sin_persona',
      'Contraseña temporal': password,
    });
    await page
      .getByRole('checkbox', { name: 'Secretaría', exact: true })
      .check();
    await save();
    await page
      .getByRole('row')
      .filter({ hasText: 'cuenta_sin_persona' })
      .getByRole('button', { name: 'Roles', exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Coordinación', exact: true })
      .check();
    await page
      .getByRole('checkbox', { name: 'Secretaría', exact: true })
      .uncheck();
    await page
      .getByLabel('Motivo del cambio')
      .fill('Cambio de rol sintético B05');
    await save();
    await page
      .getByRole('row')
      .filter({ hasText: 'cuenta_sin_persona' })
      .getByRole('cell', { name: 'Coordinación', exact: true })
      .waitFor();
    await page
      .getByRole('row')
      .filter({ hasText: 'cuenta_sin_persona' })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await page.getByRole('dialog').getByLabel('Estado').selectOption('false');
    await page
      .getByLabel('Motivo del cambio')
      .fill('Cuenta sintética inactiva');
    await save();
    const [user] = await source.query(
      "SELECT persona_id,activo FROM usuarios WHERE nombre_usuario='cuenta_sin_persona'",
    );
    expect(user).toEqual({ persona_id: null, activo: false });
    await source.query(
      "INSERT INTO secciones (codigo,nombre) SELECT 'PAGE-'||n,'Sección paginada '||n FROM generate_series(1,23) n",
    );
    await screen('secciones');
    await page.getByLabel('Estado', { exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('row').filter({ hasText: 'PAGE-23' }).waitFor();
    expect(page.url()).toContain('activo=true');
    await page.reload();
    await page.getByRole('row').filter({ hasText: 'PAGE-23' }).waitFor();
    await page.getByRole('button', { name: 'Primera página' }).click();
    await page.getByRole('row').filter({ hasText: 'DEMO-A' }).waitFor();
  });
});
