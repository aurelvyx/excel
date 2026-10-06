import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { freePort } from './browser-server.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B11 con pnpm test:db');
const password = 'Sintetica-segura-B11';
type Session = { cookie: string; csrf: string };
type Group = { id: string; periodo_id: string };
const conflict = 'Ya existe una sesión para alguna de las fechas indicadas';

describe('B11 sesiones HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let adminId: string;
  let teacherId: string;
  let teacherPersonId: string;
  let teacherUserId: string;
  let origin: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_sessions_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_sessions_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_sessions',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    await seedDemo(source);
    const [teacher] = await source.query(
      "SELECT id,persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
    );
    teacherId = teacher.id;
    teacherPersonId = teacher.persona_id;
    const encoded = await hashPassword(password);
    for (const name of ['docente', 'ajeno', 'secretaria', 'coordinador']) {
      const [user] = await source.query(
        'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave,persona_id) VALUES($1,$2,false,$3) RETURNING id',
        [name, encoded, name === 'docente' ? teacherPersonId : null],
      );
      if (name === 'docente') teacherUserId = user.id;
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, adminId, name === 'ajeno' ? 'DOCENTE' : name.toUpperCase()],
      );
    }
  }, 60000);
  beforeEach(async () => {
    origin = `http://127.0.0.1:${await freePort()}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await login('admin_sessions');
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
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    session = admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const path = (id: string) => `asistencia/grupos/${id}/sesiones`;
  async function group(assigned = true): Promise<Group> {
    const code = `B11-${++sequence}`;
    const [period] = await source.query(
      `INSERT INTO periodos_academicos(codigo,nombre,fecha_inicio,fecha_fin,matricula_inicio,matricula_fin,estado)
       VALUES($1,$1,'2026-10-01','2026-12-31','2026-09-01','2026-10-01','ABIERTO') RETURNING id`,
      [code],
    );
    const [row] = await source.query(
      `INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
       SELECT $1,nivel_id,turno_id,seccion_id,$2,'ACTIVO' FROM grupos WHERE codigo='DEMO-EN-G1' RETURNING id,periodo_id`,
      [period.id, code],
    );
    if (assigned)
      await source.query(
        "INSERT INTO grupo_docentes(grupo_id,docente_id,fecha_asignacion,activo) VALUES($1,$2,'2026-09-24',true)",
        [row.id, teacherId],
      );
    return row as Group;
  }
  const count = async (id: string) =>
    (
      await source.query(
        'SELECT count(*)::int AS n FROM sesiones_clase WHERE grupo_id=$1',
        [id],
      )
    )[0].n as number;

  it('programa un lote inclusivo en los extremos del periodo y conserva el contexto', async () => {
    const g = await group();
    const result = (
      await call('post', path(g.id))
        .send({ fechas: ['2026-10-01', '2026-12-31'] })
        .expect(201)
    ).body;
    expect(result.items).toHaveLength(2);
    expect(
      result.items.map((row: { fecha: string }) => row.fecha).sort(),
    ).toEqual(['2026-10-01', '2026-12-31']);
    for (const row of result.items)
      expect(row).toMatchObject({
        grupo_id: g.id,
        estado: 'PROGRAMADA',
        hora_inicio: null,
        hora_fin: null,
        creado_por: adminId,
      });
    const listed = (await call('get', path(g.id)).expect(200)).body;
    expect(listed.puedeProgramar).toBe(true);
    expect(listed.grupo).toMatchObject({
      id: g.id,
      periodo_id: g.periodo_id,
      estado: 'ACTIVO',
      fecha_inicio: '2026-10-01',
      fecha_fin: '2026-12-31',
      periodo_estado: 'ABIERTO',
      asistencia_cerrada: false,
    });
    expect(listed.grupo.contexto).toMatchObject({
      idioma: 'Inglés de prueba',
      turno: 'Turno sintético B02',
      seccion: 'Sección sintética A',
    });
    expect(await count(g.id)).toBe(2);
  });
  it('el docente asignado programa horas y deja evidencia del actor en auditoría', async () => {
    const g = await group();
    const result = (
      await call('post', path(g.id), await login('docente'))
        .send({ fechas: ['2026-10-05'], horaInicio: '09:15', horaFin: '11:30' })
        .expect(201)
    ).body;
    expect(result.items[0]).toMatchObject({
      creado_por: teacherUserId,
      hora_inicio: '09:15:00',
      hora_fin: '11:30:00',
      estado: 'PROGRAMADA',
    });
    const [event] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='sesiones_clase' AND entidad_id=$1 ORDER BY id DESC LIMIT 1",
      [result.items[0].id],
    );
    expect(event.usuario_id).toBe(teacherUserId);
    expect(event.accion).toBe('CREATE');
    expect(event.valor_nuevo).toMatchObject({
      grupo_id: g.id,
      fecha: '2026-10-05',
    });
    expect(event.ocurrido_at).toBeDefined();
  });
  it.each(['secretaria', 'coordinador'])(
    '%s consulta el grupo, pero no programa sesiones',
    async (name) => {
      const g = await group(false);
      const session = await login(name);
      const response = await call('get', path(g.id), session).expect(200);
      expect(response.body.puedeProgramar).toBe(false);
      await call('post', path(g.id), session)
        .send({ fechas: ['2026-10-05'] })
        .expect(403);
      expect(await count(g.id)).toBe(0);
    },
  );
  it('deniega lectura y escritura a un docente ajeno, y exige autenticación', async () => {
    const g = await group();
    const session = await login('ajeno');
    await call('get', path(g.id), session).expect(403);
    await call('post', path(g.id), session)
      .send({ fechas: ['2026-10-05'] })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/${path(g.id)}`)
      .expect(401);
    expect(await count(g.id)).toBe(0);
  });
  it('un rol de consulta adicional no permite al docente escribir grupos ajenos', async () => {
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
      [teacherUserId, adminId],
    );
    try {
      const own = await group();
      const other = await group(false);
      const session = await login('docente');
      expect(
        (await call('get', path(other.id), session).expect(200)).body
          .puedeProgramar,
      ).toBe(false);
      await call('post', path(other.id), session)
        .send({ fechas: ['2026-10-05'] })
        .expect(403);
      await call('post', path(own.id), session)
        .send({ fechas: ['2026-10-05'] })
        .expect(201);
    } finally {
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo='SECRETARIA')",
        [teacherUserId],
      );
    }
  });
  it('revocar una asignación elimina el acceso de una sesión de usuario ya iniciada', async () => {
    const g = await group();
    const session = await login('docente');
    expect(
      (await call('get', path(g.id), session).expect(200)).body.puedeProgramar,
    ).toBe(true);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [g.id, teacherId],
    );
    await call('get', path(g.id), session).expect(403);
    await call('post', path(g.id), session)
      .send({ fechas: ['2026-10-05'] })
      .expect(403);
    expect(await count(g.id)).toBe(0);
  });
  it.each(['docentes', 'personas'])(
    'inactivar %s impide programar con una sesión previa',
    async (table) => {
      const g = await group();
      const session = await login('docente');
      const id = table === 'docentes' ? teacherId : teacherPersonId;
      await source.query(`UPDATE ${table} SET activo=false WHERE id=$1`, [id]);
      try {
        await call('get', path(g.id), session).expect(403);
        await call('post', path(g.id), session)
          .send({ fechas: ['2026-10-05'] })
          .expect(403);
        expect(await count(g.id)).toBe(0);
      } finally {
        await source.query(`UPDATE ${table} SET activo=true WHERE id=$1`, [id]);
      }
    },
  );
  it.each(['grupo', 'periodo'])(
    'el cierre de %s conserva consulta y bloquea programación incluso al administrador',
    async (target) => {
      const g = await group();
      await call('post', path(g.id))
        .send({ fechas: ['2026-10-05'] })
        .expect(201);
      await source.query(
        target === 'grupo'
          ? "UPDATE grupos SET estado='CERRADO' WHERE id=$1"
          : "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
        [target === 'grupo' ? g.id : g.periodo_id],
      );
      const listed = (await call('get', path(g.id)).expect(200)).body;
      expect(listed.items).toHaveLength(1);
      expect(listed.puedeProgramar).toBe(false);
      if (target === 'grupo')
        expect(listed.grupo.asistencia_cerrada).toBe(true);
      await call('post', path(g.id))
        .send({ fechas: ['2026-10-06'] })
        .expect(409);
      await call('post', path(g.id), await login('docente'))
        .send({ fechas: ['2026-10-06'] })
        .expect(409);
      expect(await count(g.id)).toBe(1);
    },
  );
  it.each(['usuario inactivo', 'sesión revocada', 'sesión vencida'])(
    'rechaza la programación con %s aunque el docente siga asignado',
    async (state) => {
      const g = await group();
      const session = await login('docente');
      if (state === 'usuario inactivo')
        await source.query('UPDATE usuarios SET activo=false WHERE id=$1', [
          teacherUserId,
        ]);
      else if (state === 'sesión revocada')
        await source.query(
          'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE usuario_id=$1',
          [teacherUserId],
        );
      else
        await source.query(
          "UPDATE sesiones_usuario SET creado_at=CURRENT_TIMESTAMP-INTERVAL '2 hours',expira_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE usuario_id=$1",
          [teacherUserId],
        );
      try {
        await call('get', path(g.id), session).expect(401);
        await call('post', path(g.id), session)
          .send({ fechas: ['2026-10-05'] })
          .expect(401);
        expect(await count(g.id)).toBe(0);
      } finally {
        if (state === 'usuario inactivo')
          await source.query('UPDATE usuarios SET activo=true WHERE id=$1', [
            teacherUserId,
          ]);
      }
    },
  );
  it('exige CSRF para programar sin perder el acceso legítimo de consulta', async () => {
    const g = await group();
    const session = await login('docente');
    await request(app.getHttpServer())
      .post(`/api/v1/${path(g.id)}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-Requested-With', 'Excel-Web')
      .send({ fechas: ['2026-10-05'] })
      .expect(403);
    await call('get', path(g.id), session).expect(200);
    expect(await count(g.id)).toBe(0);
  });
  it('rechaza fechas, horas, campos y lotes inválidos sin persistencia parcial', async () => {
    const g = await group();
    const inputs = [
      {},
      { fechas: [] },
      { fechas: ['2026-02-30'] },
      { fechas: ['2026-10-05T09:00:00Z'] },
      { fechas: ['2026-10-05', '2026-10-05'] },
      { fechas: Array.from({ length: 101 }, () => '2026-10-05') },
      { fechas: ['2026-09-30'] },
      { fechas: ['2027-01-01'] },
      { fechas: ['2026-10-05', '2027-01-01'] },
      { fechas: ['2026-10-05'], horaInicio: '09:00' },
      { fechas: ['2026-10-05'], horaFin: '11:00' },
      { fechas: ['2026-10-05'], horaInicio: '25:00', horaFin: '26:00' },
      { fechas: ['2026-10-05'], horaInicio: '11:00', horaFin: '09:00' },
      { fechas: ['2026-10-05'], horaInicio: '09:00', horaFin: '09:00' },
      { fechas: ['2026-10-05'], estado: 'REALIZADA' },
      { fechas: ['2026-10-05'], creadoPor: adminId },
    ];
    for (const input of inputs)
      await call('post', path(g.id)).send(input).expect(400);
    expect(await count(g.id)).toBe(0);
  });
  it('una colisión revierte todo el lote y devuelve un conflicto comprensible', async () => {
    const g = await group();
    await call('post', path(g.id))
      .send({ fechas: ['2026-10-05'] })
      .expect(201);
    const result = await call('post', path(g.id))
      .send({ fechas: ['2026-10-06', '2026-10-05'] })
      .expect(409);
    expect(result.body).toMatchObject({ statusCode: 409, message: conflict });
    expect(await count(g.id)).toBe(1);
    expect(
      (
        await source.query(
          'SELECT fecha::text AS fecha FROM sesiones_clase WHERE grupo_id=$1',
          [g.id],
        )
      )[0].fecha,
    ).toBe('2026-10-05');
  });
  it('solicitudes concurrentes no duplican fechas ni dejan lotes parciales', async () => {
    const g = await group();
    const input = { fechas: ['2026-10-05', '2026-10-06'] };
    const responses = await Promise.all([
      call('post', path(g.id)).send(input),
      call('post', path(g.id)).send(input),
    ]);
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await count(g.id)).toBe(2);
  });
  it('un fallo de auditoría revierte sesiones y no expone detalles internos', async () => {
    const g = await group();
    const service = app.get(AuditService);
    const record = service.record.bind(service);
    let events = 0;
    vi.spyOn(service, 'record').mockImplementation(async (event, manager) => {
      if (event.entidad === 'sesiones_clase' && ++events === 2)
        throw new Error('Fallo sintético privado B11');
      await record(event, manager);
    });
    const res = await call('post', path(g.id))
      .send({ fechas: ['2026-10-05', '2026-10-06'] })
      .expect(500);
    expect(res.body.message).toBe('Error interno del servidor');
    expect(JSON.stringify(res.body)).not.toContain('privado B11');
    expect(await count(g.id)).toBe(0);
    expect(
      await source.query(
        "SELECT a.id FROM auditoria_eventos a WHERE a.entidad='sesiones_clase' AND a.valor_nuevo->>'grupo_id'=$1",
        [g.id],
      ),
    ).toEqual([]);
  });
  it('la base rechaza fechas externas, duplicados y eliminación del historial', async () => {
    const g = await group();
    const insert = (date: string) =>
      source.query(
        "INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,'PROGRAMADA',$3) RETURNING id",
        [g.id, date, adminId],
      );
    await expect(insert('2026-09-30')).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    const [row] = await insert('2026-10-05');
    await expect(insert('2026-10-05')).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    await expect(
      source.query('DELETE FROM sesiones_clase WHERE id=$1', [row.id]),
    ).rejects.toThrow();
    expect(await count(g.id)).toBe(1);
  });
  it('la base impide reducir el periodo o cambiar el contexto dejando sesiones fuera', async () => {
    const g = await group();
    await call('post', path(g.id))
      .send({ fechas: ['2026-10-01', '2026-12-31'] })
      .expect(201);
    await expect(
      source.query(
        "UPDATE periodos_academicos SET fecha_inicio='2026-10-02' WHERE id=$1",
        [g.periodo_id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      source.query(
        "UPDATE periodos_academicos SET fecha_fin='2026-12-30' WHERE id=$1",
        [g.periodo_id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const other = await group(false);
    await source.query(
      "UPDATE periodos_academicos SET fecha_inicio='2026-11-01',fecha_fin='2026-11-30' WHERE id=$1",
      [other.periodo_id],
    );
    await expect(
      source.query('UPDATE grupos SET periodo_id=$1 WHERE id=$2', [
        other.periodo_id,
        g.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(
      (await call('get', path(g.id)).expect(200)).body.grupo.periodo_id,
    ).toBe(g.periodo_id);
  });
  it('pagina sin repetir sesiones y publica el contrato OpenAPI', async () => {
    const g = await group();
    await call('post', path(g.id))
      .send({ fechas: ['2026-10-03', '2026-10-01', '2026-10-02'] })
      .expect(201);
    const first = (
      await call('get', `${path(g.id)}?limit=2&after=0`).expect(200)
    ).body;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (
      await call(
        'get',
        `${path(g.id)}?limit=2&after=${first.nextCursor}`,
      ).expect(200)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.items, ...second.items].map((row: { id: string }) => row.id),
      ).size,
    ).toBe(3);
    for (const query of ['limit=101', 'after=-1', 'extra=1'])
      await call('get', `${path(g.id)}?${query}`).expect(400);
    await call('get', path('no-id')).expect(400);
    await call('get', path('999999999')).expect(404);
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const contract = spec.paths['/api/v1/asistencia/grupos/{grupoId}/sesiones'];
    expect(contract.get.responses['200']).toBeDefined();
    expect(contract.post.responses['201']).toBeDefined();
    expect(contract.post.requestBody).toBeDefined();
    await call('patch', path(g.id)).send({ estado: 'CANCELADA' }).expect(404);
    await call('delete', path(g.id)).send({}).expect(404);
  });
});
