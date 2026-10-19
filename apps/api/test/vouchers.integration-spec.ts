import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { createWebServer, freePort } from './browser-server.js';
if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B07 con pnpm test:db');
const password = 'Sintetica-segura-B07';
type Session = { cookie: string; csrf: string };
describe('B07 vouchers HTTP, navegador y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let adminId: string;
  let studentId: string;
  let origin: string;
  let port: number;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  const payload = () => ({
    estudianteId: studentId,
    numero: `B07-${++sequence}`,
    fechaPago: '2026-09-28',
    importe: '100.50',
  });
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_vouchers_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_vouchers_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_vouchers',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    const encoded = await hashPassword(password);
    for (const role of ['SECRETARIA', 'DOCENTE', 'COORDINADOR']) {
      const [user] = await source.query(
        'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave) VALUES($1,$2,false) RETURNING id',
        [role.toLowerCase(), encoded],
      );
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, adminId, role],
      );
    }
    const [person] = await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO','B07-PERSONA','Alumno voucher','Sintético') RETURNING id",
    );
    const [student] = await source.query(
      "INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,'SYN-B07','2026-09-28') RETURNING id",
      [person.id],
    );
    studentId = student.id;
  }, 60000);
  beforeEach(async () => {
    port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await login('admin_vouchers');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
  });
  async function login(name: string): Promise<Session> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Requested-With', 'Excel-Web')
      .send({ nombreUsuario: name, password })
      .expect(200);
    return {
      cookie: (res.headers['set-cookie'] as unknown as string[])[0]!.split(
        ';',
      )[0]!,
      csrf: res.body.csrfToken,
    };
  }
  function call(
    method: 'get' | 'post' | 'patch',
    path: string,
    session = admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/vouchers${path}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const create = async () =>
    (await call('post', '').send(payload()).expect(201)).body;
  it('secretaría registra, valida y conserva responsable, importe exacto y auditoría sin activar matrícula', async () => {
    const secretary = await login('secretaria');
    const row = (
      await call('post', '', secretary)
        .send({ ...payload(), importe: '0.01' })
        .expect(201)
    ).body;
    expect(row.estado).toBe('PENDIENTE');
    expect(row.importe).toBe('0.01');
    expect(row.validado_por).toBeNull();
    const result = (
      await call('patch', `/${row.id}/decision`, secretary)
        .send({ estado: 'VALIDADO' })
        .expect(200)
    ).body;
    expect(result.responsable).toBe('secretaria');
    expect(result.validado_at).toBeTruthy();
    const audits = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='vouchers' AND entidad_id=$1 ORDER BY id",
      [row.id],
    );
    expect(audits.map((a: { accion: string }) => a.accion)).toEqual([
      'CREATE',
      'VALIDATE',
    ]);
    expect(audits[1].valor_anterior.estado).toBe('PENDIENTE');
    expect(audits[1].valor_nuevo.estado).toBe('VALIDADO');
    expect(
      (await source.query('SELECT count(*)::int AS n FROM matriculas'))[0].n,
    ).toBe(0);
  });
  it('rechazo requiere observación y una decisión resuelta no se sustituye', async () => {
    const row = await create();
    await call('patch', `/${row.id}/decision`)
      .send({ estado: 'RECHAZADO', observacion: '   ' })
      .expect(400);
    const result = (
      await call('patch', `/${row.id}/decision`)
        .send({ estado: 'RECHAZADO', observacion: ' Comprobante ilegible ' })
        .expect(200)
    ).body;
    expect(result.observacion).toBe('Comprobante ilegible');
    await call('patch', `/${row.id}/decision`)
      .send({ estado: 'VALIDADO' })
      .expect(409);
    await expect(
      source.query("UPDATE vouchers SET estado='VALIDADO' WHERE id=$1", [
        row.id,
      ]),
    ).rejects.toThrow();
  });
  it('bloquea duplicados simultáneos y normaliza espacios exteriores', async () => {
    const input = payload();
    const results = await Promise.all([
      call('post', '').send(input),
      call('post', '').send({ ...input, numero: ` ${input.numero} ` }),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(
      (
        await source.query(
          'SELECT count(*)::int AS n FROM vouchers WHERE numero=$1',
          [input.numero],
        )
      )[0].n,
    ).toBe(1);
  });
  it('resuelve dos decisiones simultáneas una sola vez', async () => {
    const row = await create();
    const results = await Promise.all([
      call('patch', `/${row.id}/decision`).send({ estado: 'VALIDADO' }),
      call('patch', `/${row.id}/decision`).send({
        estado: 'RECHAZADO',
        observacion: 'Sintético',
      }),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
  });
  it('rechaza valores inválidos, campos extra, fechas inexistentes y estudiante ausente', async () => {
    for (const change of [
      { importe: '0' },
      { importe: '-1' },
      { importe: '1.001' },
      { importe: 1.2 },
      { importe: '100000000.00' },
      { numero: ' ' },
      { fechaPago: '2026-02-30' },
      { estado: 'VALIDADO' },
      { duplicadoAutorizadoPor: adminId },
    ])
      await call('post', '')
        .send({ ...payload(), ...change })
        .expect(400);
    await call('post', '')
      .send({ ...payload(), estudianteId: '9999999' })
      .expect(404);
    await call('get', '?estado=OTRO').expect(400);
    await call('get', '?campo=1').expect(400);
  });
  it('rechaza alta de estudiante inactivo y conserva identidad y registro', async () => {
    await source.query('UPDATE estudiantes SET activo=false WHERE id=$1', [
      studentId,
    ]);
    try {
      await call('post', '').send(payload()).expect(409);
    } finally {
      await source.query('UPDATE estudiantes SET activo=true WHERE id=$1', [
        studentId,
      ]);
    }
    const row = await create();
    await expect(
      source.query('UPDATE vouchers SET importe=200 WHERE id=$1', [row.id]),
    ).rejects.toThrow();
    await expect(
      source.query('DELETE FROM vouchers WHERE id=$1', [row.id]),
    ).rejects.toThrow();
  });
  it('protege consultas y escrituras para docente, coordinación y sesión anónima', async () => {
    const row = await create();
    await request(app.getHttpServer()).get('/api/v1/vouchers').expect(401);
    for (const role of ['docente', 'coordinador']) {
      const session = await login(role);
      await call('get', '', session).expect(403);
      await call('get', `/${row.id}`, session).expect(403);
      await call('post', '', session).send(payload()).expect(403);
      await call('patch', `/${row.id}/decision`, session)
        .send({ estado: 'VALIDADO' })
        .expect(403);
    }
  });
  it('revierte alta y decisión cuando falla la auditoría', async () => {
    const row = await create();
    const input = payload();
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new Error('Fallo sintético'),
    );
    await call('post', '').send(input).expect(500);
    await call('patch', `/${row.id}/decision`)
      .send({ estado: 'VALIDADO' })
      .expect(500);
    expect(
      (
        await source.query('SELECT id FROM vouchers WHERE numero=$1', [
          input.numero,
        ])
      ).length,
    ).toBe(0);
    expect(
      (
        await source.query('SELECT estado FROM vouchers WHERE id=$1', [row.id])
      )[0].estado,
    ).toBe('PENDIENTE');
  });
  it('pagina, filtra por estudiante/estado y busca caracteres literales', async () => {
    const input = { ...payload(), numero: 'B07-%_literal' };
    await call('post', '').send(input).expect(201);
    const found = (await call('get', '?q=%25_').expect(200)).body;
    expect(found.items.map((r: { numero: string }) => r.numero)).toEqual([
      input.numero,
    ]);
    const first = (
      await call(
        'get',
        `?limit=1&estudianteId=${studentId}&estado=PENDIENTE`,
      ).expect(200)
    ).body;
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const next = (
      await call('get', `?limit=1&after=${first.nextCursor}`).expect(200)
    ).body;
    expect(next.items[0].id).not.toBe(first.items[0].id);
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    expect(spec.paths['/api/v1/vouchers/{id}/decision'].patch).toBeDefined();
  });
  it('secretaría registra y valida en navegador; conserva contexto y funciona en móvil', async () => {
    await app.listen(0, '127.0.0.1');
    const vite = await createWebServer(await app.getUrl(), port);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(10000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin);
      await page.getByLabel('Usuario', { exact: true }).fill('secretaria');
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await page.getByRole('link', { name: 'Vouchers', exact: true }).click();
      await page
        .getByRole('button', { name: 'Registrar voucher', exact: true })
        .click();
      await page.getByLabel('Buscar estudiante').fill('SYN-B07');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Buscar', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Seleccionar', exact: true })
        .click();
      await page.getByLabel('Número de voucher').fill('B07-NAVEGADOR');
      await page.getByLabel('Fecha de pago').fill('2026-09-28');
      await page.getByLabel('Importe', { exact: true }).fill('150.25');
      await page.getByRole('button', { name: 'Revisar cambios' }).click();
      await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
      const row = page.getByRole('row').filter({
        has: page.getByRole('cell', { name: 'B07-NAVEGADOR', exact: true }),
      });
      await row.getByRole('button', { name: 'Revisar voucher' }).click();
      await page
        .getByLabel('Decisión', { exact: true })
        .selectOption('VALIDADO');
      await page.getByRole('button', { name: 'Revisar decisión' }).click();
      await page
        .getByRole('button', { name: 'Confirmar decisión', exact: true })
        .click();
      await row.getByRole('cell', { name: 'Validado', exact: true }).waitFor();
      const artifacts = fileURLToPath(
        new URL('../../../.tmp/b07/', import.meta.url),
      );
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({
        path: `${artifacts}/vouchers.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${artifacts}/vouchers-movil.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.goto(`${origin}/#/vouchers?estudianteId=${studentId}`);
      await page
        .getByRole('button', { name: 'Registrar voucher', exact: true })
        .click();
      await page.getByLabel('Número de voucher').waitFor();
      expect(await page.getByRole('dialog').textContent()).toContain(
        'Alumno voucher',
      );
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await vite.close();
    }
  }, 60000);
});
