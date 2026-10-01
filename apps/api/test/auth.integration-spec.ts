import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import {
  hashPassword,
  digest,
  COOKIE_NAME,
} from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test') {
  throw new Error('Ejecutar B03 con pnpm test:db');
}

@Controller('sin-politica')
class UndeclaredController {
  @Get() get() {
    return { secreto: true };
  }
}

const origin = 'http://127.0.0.1:3000';
const password = 'Sintetica-segura-2026';
type Session = { cookie: string; csrf: string; id: string };

describe('B03 acceso y permisos sobre PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let adminId: string;
  let sequence = 0;
  const unique = () => `prueba_${++sequence}`;
  beforeAll(async () => {
    const base = new DataSource(databaseOptions());
    await base.initialize();
    try {
      await base.query('CREATE DATABASE excel_auth_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_auth_test';
    source = new DataSource(databaseOptions());
    await source.initialize();
    await source.runMigrations();
    adminId = (await bootstrapAdministrator(source, 'admin_prueba', password))
      .id;
    // Fixture de administrador operativo; el flujo temporal se comprueba aparte por HTTP.
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    const encoded = await hashPassword(password);
    for (const role of ['DOCENTE', 'SECRETARIA', 'COORDINADOR']) {
      const [user] = await source.query(
        `INSERT INTO usuarios (nombre_usuario,password_hash,requiere_cambio_clave)
        VALUES ($1,$2,false) RETURNING id`,
        [role.toLowerCase(), encoded],
      );
      await source.query(
        `INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por)
        SELECT $1,id,$2 FROM roles WHERE codigo=$3`,
        [user.id, adminId, role],
      );
    }
  });
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [UndeclaredController],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
  });

  function post(path: string, session?: Session) {
    const call = request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .set('Origin', origin)
      .set('X-Requested-With', 'Excel-Web');
    if (session)
      call.set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf);
    return call;
  }
  async function login(
    name = 'admin_prueba',
    secret = password,
  ): Promise<Session> {
    const response = await post('auth/login')
      .send({ nombreUsuario: name, password: secret })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return {
      cookie: cookies[0]!.split(';')[0]!,
      csrf: response.body.csrfToken,
      id: response.body.user.id,
    };
  }
  function patch(path: string, session: Session) {
    return request(app.getHttpServer())
      .patch(`/api/v1/${path}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
  }
  function roles(id: string, session: Session) {
    return request(app.getHttpServer())
      .put(`/api/v1/usuarios/${id}/roles`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
  }
  async function create(session: Session, role = 'DOCENTE') {
    const name = unique();
    const response = await post('usuarios', session)
      .send({ nombreUsuario: name, passwordTemporal: password, roles: [role] })
      .expect(201);
    return { id: response.body.id as string, name };
  }

  it('no permite bootstrap cuando ya existe administrador', async () => {
    await expect(
      bootstrapAdministrator(source, 'otro_admin', password),
    ).rejects.toThrow('Ya existe');
  });

  it('OpenAPI documenta entradas y respuestas de acceso y usuarios', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    expect(
      response.body.paths['/api/v1/auth/login'].post.requestBody,
    ).toBeDefined();
    expect(response.body.components.schemas.CreateUserDto.required).toContain(
      'roles',
    );
    expect(
      response.body.components.schemas.SessionDto.properties.csrfToken,
    ).toBeDefined();
  });

  it('login guarda solo hash del token y devuelve cookie HttpOnly, CSRF y roles sin secretos', async () => {
    const response = await post('auth/login')
      .send({ nombreUsuario: 'admin_prueba', password })
      .expect(200);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.user.roles).toEqual(['ADMIN']);
    expect(JSON.stringify(response.body)).not.toMatch(/password|token_hash/);
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const [session] = await source.query(
      'SELECT token_hash,expira_at-creado_at AS duracion FROM sesiones_usuario WHERE token_hash=$1',
      [digest(token)],
    );
    expect(session.token_hash).not.toBe(token);
    expect(session.duracion.minutes).toBe(15);
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE accion='LOGIN' AND usuario_id=$1",
        [adminId],
      ),
    ).not.toHaveLength(0);
  });

  it('credenciales incorrectas, cuenta desconocida e inactiva tienen el mismo mensaje', async () => {
    const admin = await login();
    const user = await create(admin);
    await patch(`usuarios/${user.id}`, admin)
      .send({ activo: false, motivo: 'Prueba inactivación' })
      .expect(200);
    for (const [name, secret] of [
      ['admin_prueba', 'incorrecta'],
      ['desconocido', password],
      [user.name, password],
    ]) {
      const response = await post('auth/login')
        .send({ nombreUsuario: name, password: secret })
        .expect(401);
      expect(response.body.message).toBe('Credenciales inválidas');
    }
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE accion='LOGIN_FAILED'",
      ),
    ).toHaveLength(3);
  });

  it('sin sesión rechaza consulta y creación administrativas', async () => {
    await request(app.getHttpServer()).get('/api/v1/usuarios').expect(401);
    await post('usuarios').send({}).expect(401);
  });

  it.each(['docente', 'secretaria', 'coordinador'])(
    '%s recibe 403 en todas las operaciones administrativas',
    async (role) => {
      const session = await login(role);
      await request(app.getHttpServer())
        .get('/api/v1/usuarios')
        .set('Cookie', session.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/usuarios/roles')
        .set('Cookie', session.cookie)
        .expect(403);
      await post('usuarios', session).send({}).expect(403);
      await patch(`usuarios/${session.id}`, session)
        .send({ activo: true, motivo: 'Sin permisos' })
        .expect(403);
      await roles(session.id, session)
        .send({ roles: ['ADMIN'], motivo: 'Escalada inválida' })
        .expect(403);
    },
  );

  it('una ruta sin política explícita se deniega incluso al administrador', async () => {
    const admin = await login();
    await request(app.getHttpServer())
      .get('/api/v1/sin-politica')
      .set('Cookie', admin.cookie)
      .expect(403);
  });

  it('fuerza cambio de clave temporal, revoca la sesión y permite volver a entrar', async () => {
    const admin = await login();
    const user = await create(admin);
    const temporal = await login(user.name);
    const secondSession = await login(user.name);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Cookie', temporal.cookie)
      .expect(403);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporal.cookie)
      .expect(200);
    expect(me.body.user.requiere_cambio_clave).toBe(true);
    expect(me.body.csrfToken).toBe(temporal.csrf);
    await post('auth/password', temporal)
      .send({
        passwordActual: 'incorrecta',
        passwordNueva: 'Otra-sintetica-2026',
      })
      .expect(401);
    await post('auth/password', temporal)
      .send({ passwordActual: password, passwordNueva: 'Otra-sintetica-2026' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporal.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', secondSession.cookie)
      .expect(401);
    const current = await login(user.name, 'Otra-sintetica-2026');
    const result = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', current.cookie)
      .expect(200);
    expect(result.body.user.requiere_cambio_clave).toBe(false);
  });

  it('logout invalida el token también al reutilizar la cookie manualmente', async () => {
    const session = await login('docente');
    await post('auth/logout', session).send({}).expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', session.cookie)
      .expect(401);
  });

  it('deniega cookies manipuladas y sesiones vencidas', async () => {
    const session = await login('docente');
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${COOKIE_NAME}=${'a'.repeat(64)}`)
      .expect(401);
    await source.query(
      `UPDATE sesiones_usuario SET creado_at=now()-interval '2 hours',expira_at=now()-interval '1 hour' WHERE token_hash=$1`,
      [digest(session.cookie.split('=')[1]!)],
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', session.cookie)
      .expect(401);
  });

  it('rechaza CSRF ausente, CSRF ajeno, origen malicioso y login sin cabecera', async () => {
    const admin = await login();
    const other = await login('docente');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(403);
    await post('auth/logout', { ...admin, csrf: other.csrf })
      .send({})
      .expect(403);
    await post('auth/logout', admin)
      .set('Origin', 'https://atacante.invalid')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ nombreUsuario: 'admin_prueba', password })
      .expect(403);
  });

  it('valida DTO, roles y duplicados sin persistir operaciones rechazadas', async () => {
    const admin = await login();
    for (const body of [
      {
        nombreUsuario: unique(),
        passwordTemporal: 'corta',
        roles: ['DOCENTE'],
      },
      {
        nombreUsuario: unique(),
        passwordTemporal: password,
        roles: ['ESTUDIANTE'],
      },
      { nombreUsuario: unique(), passwordTemporal: password, roles: [] },
      {
        nombreUsuario: unique(),
        passwordTemporal: password,
        roles: ['DOCENTE'],
        activo: true,
      },
      {
        nombreUsuario: unique(),
        passwordTemporal: password,
        roles: ['DOCENTE'],
        personaId: null,
      },
    ])
      await post('usuarios', admin).send(body).expect(400);
    await post('usuarios', admin)
      .send({
        nombreUsuario: 'admin_prueba',
        passwordTemporal: password,
        roles: ['ADMIN'],
      })
      .expect(409);
    await patch(`usuarios/${adminId}`, admin)
      .send({ activo: null, motivo: 'Campo inválido' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios?limit=1000')
      .set('Cookie', admin.cookie)
      .expect(400);
  });

  it('admin lista datos mínimos, edita, inactiva y reactiva una cuenta con auditoría', async () => {
    const admin = await login();
    const user = await create(admin);
    const session = await login(user.name);
    const response = await request(app.getHttpServer())
      .get('/api/v1/usuarios?limit=2')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
    await patch(`usuarios/${user.id}`, admin)
      .send({
        activo: false,
        nombreUsuario: `${user.name}_editado`,
        motivo: 'Ajuste sintético',
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', session.cookie)
      .expect(401);
    await patch(`usuarios/${user.id}`, admin)
      .send({ activo: true, motivo: 'Reactivar sintético' })
      .expect(200);
    await login(`${user.name}_editado`);
    const [audit] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE accion='INACTIVATE' AND entidad_id=$1",
      [user.id],
    );
    expect(audit.usuario_id).toBe(adminId);
    expect(audit.motivo).toBe('Ajuste sintético');
    expect(audit.valor_anterior.activo).toBe(true);
    expect(audit.valor_nuevo.activo).toBe(false);
    expect(audit.ocurrido_at).toBeInstanceOf(Date);
  });

  it('reemplaza roles, revoca permisos anteriores y no permite autoasignación', async () => {
    const admin = await login();
    const user = await create(admin);
    const session = await login(user.name);
    await roles(user.id, admin)
      .send({
        roles: ['SECRETARIA', 'COORDINADOR'],
        motivo: 'Cambio de funciones',
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', session.cookie)
      .expect(401);
    const renewed = await login(user.name);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', renewed.cookie)
      .expect(200);
    expect(me.body.user.roles).toEqual(['COORDINADOR', 'SECRETARIA']);
  });

  it('protege al último administrador activo', async () => {
    const admin = await login();
    await patch(`usuarios/${adminId}`, admin)
      .send({ activo: false, motivo: 'Prueba último admin' })
      .expect(409);
    await roles(adminId, admin)
      .send({ roles: ['DOCENTE'], motivo: 'Prueba último admin' })
      .expect(409);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Cookie', admin.cookie)
      .expect(200);
  });

  it('la auditoría no admite UPDATE, DELETE ni TRUNCATE y no contiene secretos', async () => {
    for (const sql of [
      "UPDATE auditoria_eventos SET motivo='alterado'",
      'DELETE FROM auditoria_eventos',
      'TRUNCATE auditoria_eventos',
    ]) {
      await expect(source.query(sql)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    }
    const rows = await source.query('SELECT * FROM auditoria_eventos');
    expect(JSON.stringify(rows)).not.toContain(password);
    expect(JSON.stringify(rows)).not.toMatch(
      /password_hash|token_hash|csrfToken|\$argon2/,
    );
    await source.undoLastMigration(); // Protección B08 sin matrículas.
    await source.undoLastMigration(); // Protección B07 sin vouchers.
    await source.undoLastMigration(); // Historial B06 vacío; ahora se intenta revertir acceso/auditoría.
    await expect(source.undoLastMigration()).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await source.runMigrations();
  });

  it('un fallo de auditoría revierte la creación del usuario', async () => {
    const admin = await login();
    const count = await source.query('SELECT count(*) AS count FROM usuarios');
    const record = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('Fallo simulado'));
    try {
      await post('usuarios', admin)
        .send({
          nombreUsuario: unique(),
          passwordTemporal: password,
          roles: ['DOCENTE'],
        })
        .expect(500);
    } finally {
      record.mockRestore();
    }
    expect(
      await source.query('SELECT count(*) AS count FROM usuarios'),
    ).toEqual(count);
  });

  it('limita intentos de login por IP sin confiar en X-Forwarded-For', async () => {
    for (let i = 0; i < 10; i++)
      await post('auth/login')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .send({ nombreUsuario: 'desconocido', password: 'incorrecta' })
        .expect(401);
    await post('auth/login')
      .set('X-Forwarded-For', '192.0.2.99')
      .send({ nombreUsuario: 'desconocido', password: 'incorrecta' })
      .expect(429);
  });

  it('dos inactivaciones concurrentes conservan al menos un administrador', async () => {
    const first = await login();
    const user = await create(first, 'ADMIN');
    const temporary = await login(user.name);
    await post('auth/password', temporary)
      .send({
        passwordActual: password,
        passwordNueva: 'Concurrente-segura-2026',
      })
      .expect(204);
    const second = await login(user.name, 'Concurrente-segura-2026');
    const results = await Promise.all([
      patch(`usuarios/${first.id}`, first).send({
        activo: false,
        motivo: 'Prueba concurrente A',
      }),
      patch(`usuarios/${second.id}`, second).send({
        activo: false,
        motivo: 'Prueba concurrente B',
      }),
    ]);
    expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const active =
      await source.query(`SELECT u.id FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id=u.id
      JOIN roles r ON r.id=ur.rol_id WHERE u.activo AND r.activo AND r.codigo='ADMIN'`);
    expect(active).toHaveLength(1);
  });
});
