import { DataSource } from 'typeorm';
import { checkMigrationReversal } from './migration-test.js';
import { Asistencia1790208009000 } from '../src/database/migraciones/1790208009000-asistencia.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { freePort } from './browser-server.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureSession,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B12 con pnpm test:db');
const password = 'Sintetica-segura-B12';
type Session = { cookie: string; csrf: string };
type Code = 'P' | 'F' | 'T' | 'J';
type Mark = {
  id: string;
  matricula_id: string;
  codigo: Code;
  observacion: string | null;
  version: number;
  registrado_por: string;
  registrado_at: string;
  actualizado_at: string | null;
};
const conflict =
  'La asistencia cambió desde tu última consulta. Recarga antes de guardar';

describe('B12 asistencia HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let writer: Session;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  const previousOrigins = process.env.WEB_ORIGINS;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_attendance_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_attendance',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    fixture = await attendanceFixture(source, adminId, password);
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
    admin = await login('admin_attendance');
    writer = await login('docente');
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
    method: 'get' | 'patch',
    path: string,
    session = method === 'patch' ? writer : admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const path = (s: AttendanceFixtureSession) =>
    `asistencia/grupos/${s.grupo_id}/sesiones/${s.id}/asistencias`;
  const entry = (
    m: AttendanceFixtureEnrollment,
    codigo: Code = 'P',
    version: number | null = null,
    observacion?: string | null,
  ) => ({
    matriculaId: m.id,
    codigo,
    version,
    ...(observacion === undefined ? {} : { observacion }),
  });
  async function matrix(count = 2) {
    const group = await fixture.group();
    const session = await fixture.session(group);
    const students = [];
    const enrollments = [];
    for (let index = 0; index < count; index++) {
      const student = await fixture.student();
      students.push(student);
      enrollments.push(await fixture.enroll(group, student));
    }
    return { group, session, students, enrollments };
  }
  const save = (
    s: AttendanceFixtureSession,
    registros: ReturnType<typeof entry>[],
    user = writer,
  ) => call('patch', path(s), user).send({ registros });
  async function count(s: AttendanceFixtureSession) {
    return (
      await source.query(
        'SELECT count(*)::int AS n FROM asistencias WHERE sesion_id=$1',
        [s.id],
      )
    )[0].n as number;
  }

  it('consulta la matriz activa sin convertir las marcas pendientes en faltas', async () => {
    const f = await matrix(3);
    const pending = await fixture.enroll(
      f.group,
      await fixture.student(),
      'PENDIENTE',
    );
    const response = (
      await call('get', path(f.session), await login('docente')).expect(200)
    ).body;
    expect(response.puedeEditar).toBe(true);
    expect(response.items).toHaveLength(3);
    expect(response.sesion).toMatchObject({
      id: f.session.id,
      fecha: fixture.today,
      estado: 'PROGRAMADA',
    });
    expect(response.grupo).toMatchObject({
      id: f.group.id,
      codigo: f.group.codigo,
      estado: 'ACTIVO',
      periodo_estado: 'ABIERTO',
    });
    expect(response.grupo.contexto.idioma).toBe('Inglés de prueba');
    response.items.forEach(
      (row: {
        matricula_id: string;
        asistencia: Mark | null;
        editable: boolean;
      }) => {
        expect(row.asistencia).toBeNull();
        expect(row.editable).toBe(true);
        expect(row.matricula_id).not.toBe(pending.id);
      },
    );
    expect(response.items[0]).toMatchObject({
      matricula_id: f.enrollments[0]!.id,
      codigo_matricula: f.enrollments[0]!.codigo,
      estudiante_id: f.students[0]!.id,
      estudiante: f.students[0]!.nombre,
      numero_documento: f.students[0]!.documento,
      numero_intento: 1,
      estado_matricula: 'ACTIVA',
    });
    expect(await count(f.session)).toBe(0);
  });
  it('guarda P/F/T/J por matrícula y confirma la sesión en la misma transacción', async () => {
    const f = await matrix(5);
    const docente = await login('docente');
    const codes: Code[] = ['P', 'F', 'T', 'J'];
    const response = (
      await save(
        f.session,
        f.enrollments
          .slice(0, 4)
          .map((m, index) =>
            entry(
              m,
              codes[index]!,
              null,
              index === 3 ? 'Pendiente de resolver B14' : null,
            ),
          ),
        docente,
      ).expect(200)
    ).body;
    expect(response.items).toHaveLength(4);
    expect(response.sesion.estado).toBe('REALIZADA');
    for (const record of response.items as Mark[])
      expect(record).toMatchObject({
        version: 1,
        registrado_por: fixture.userIds.docente,
        actualizado_at: null,
      });
    const rows = await source.query(
      'SELECT matricula_id,codigo,observacion,version FROM asistencias WHERE sesion_id=$1 ORDER BY matricula_id',
      [f.session.id],
    );
    expect(rows.map((row: { codigo: string }) => row.codigo)).toEqual(codes);
    expect(rows[3].observacion).toBe('Pendiente de resolver B14');
    expect(await count(f.session)).toBe(4);
    const listed = (await call('get', path(f.session)).expect(200)).body;
    expect(
      listed.items.find(
        (row: { matricula_id: string }) =>
          row.matricula_id === f.enrollments[4]!.id,
      ).asistencia,
    ).toBeNull();
    const audits = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='asistencias' AND valor_nuevo->>'sesion_id'=$1 ORDER BY id",
      [f.session.id],
    );
    expect(audits).toHaveLength(4);
    expect(
      audits.every(
        (event: { usuario_id: string; accion: string }) =>
          event.usuario_id === fixture.userIds.docente &&
          event.accion === 'CREATE',
      ),
    ).toBe(true);
    const [sessionAudit] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='sesiones_clase' AND entidad_id=$1 ORDER BY id DESC LIMIT 1",
      [f.session.id],
    );
    expect(sessionAudit.valor_anterior.estado).toBe('PROGRAMADA');
    expect(sessionAudit.valor_nuevo.estado).toBe('REALIZADA');
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[])',
        [f.enrollments.map((m) => m.id)],
      ),
    ).toEqual([]);
  });
  it('corrige un registro abierto preservando creador, versión y antes/después auditados', async () => {
    const f = await matrix(1);
    const editor = await login('docente2');
    const before = (
      await save(
        f.session,
        [entry(f.enrollments[0]!, 'P', null, 'Comentario inicial')],
        await login('docente'),
      ).expect(200)
    ).body.items[0] as Mark;
    const after = (
      await save(
        f.session,
        [entry(f.enrollments[0]!, 'T', before.version)],
        editor,
      ).expect(200)
    ).body.items[0] as Mark;
    expect(after).toMatchObject({
      id: before.id,
      codigo: 'T',
      observacion: 'Comentario inicial',
      version: 2,
      registrado_por: before.registrado_por,
      registrado_at: before.registrado_at,
    });
    expect(after.actualizado_at).not.toBeNull();
    const cleared = (
      await save(
        f.session,
        [entry(f.enrollments[0]!, 'F', 2, null)],
        editor,
      ).expect(200)
    ).body.items[0] as Mark;
    expect(cleared).toMatchObject({
      codigo: 'F',
      observacion: null,
      version: 3,
    });
    const [event] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='asistencias' AND entidad_id=$1 AND accion='UPDATE' ORDER BY id DESC LIMIT 1",
      [cleared.id],
    );
    expect(event.usuario_id).toBe(fixture.userIds.docente2);
    expect(event.valor_anterior).toMatchObject({
      codigo: 'T',
      observacion: 'Comentario inicial',
      version: 2,
    });
    expect(event.valor_nuevo).toMatchObject({
      codigo: 'F',
      observacion: null,
      version: 3,
    });
    expect(event.ocurrido_at).toBeDefined();
  });
  it('un guardado sin cambios no incrementa versión ni fecha ni auditoría', async () => {
    const f = await matrix(1);
    const first = (
      await save(f.session, [
        entry(f.enrollments[0]!, 'P', null, 'Comentario'),
      ]).expect(200)
    ).body.items[0] as Mark;
    const audits = await source.query(
      "SELECT id FROM auditoria_eventos WHERE entidad='asistencias' AND entidad_id=$1",
      [first.id],
    );
    await save(f.session, [
      entry(f.enrollments[0]!, 'P', 1, ' Comentario '),
    ]).expect(200);
    const listed = (await call('get', path(f.session)).expect(200)).body
      .items[0].asistencia as Mark;
    expect(listed).toMatchObject({
      id: first.id,
      version: 1,
      actualizado_at: null,
    });
    expect(new Date(listed.registrado_at).getTime()).toBe(
      new Date(first.registrado_at).getTime(),
    );
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE entidad='asistencias' AND entidad_id=$1",
        [first.id],
      ),
    ).toEqual(audits);
  });
  it('dos altas simultáneas crean una sola marca sin sobrescribir la otra captura', async () => {
    const f = await matrix(1);
    const responses = await Promise.all([
      save(f.session, [entry(f.enrollments[0]!, 'P')]),
      save(f.session, [entry(f.enrollments[0]!, 'F')]),
    ]);
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(responses.find((res) => res.status === 409)!.body.message).toBe(
      conflict,
    );
    expect(await count(f.session)).toBe(1);
    expect(
      (await call('get', path(f.session)).expect(200)).body.items[0].asistencia
        .version,
    ).toBe(1);
  });
  it('un conflicto de versión revierte las demás filas del lote', async () => {
    const f = await matrix(2);
    await save(
      f.session,
      f.enrollments.map((m) => entry(m)),
    ).expect(200);
    await save(f.session, [entry(f.enrollments[1]!, 'T', 1)]).expect(200);
    const conflictResponse = await save(f.session, [
      entry(f.enrollments[0]!, 'F', 1),
      entry(f.enrollments[1]!, 'J', 1),
    ]).expect(409);
    expect(conflictResponse.body.message).toBe(conflict);
    const rows = await source.query(
      'SELECT codigo,version FROM asistencias WHERE sesion_id=$1 ORDER BY matricula_id',
      [f.session.id],
    );
    expect(rows).toEqual([
      { codigo: 'P', version: 1 },
      { codigo: 'T', version: 2 },
    ]);
    await save(f.session, [entry(f.enrollments[0]!, 'F', null)]).expect(409);
  });
  it('un fallo del segundo evento revierte marcas, auditoría y estado de sesión', async () => {
    const f = await matrix(2);
    const service = app.get(AuditService);
    const original = service.record.bind(service);
    let marks = 0;
    vi.spyOn(service, 'record').mockImplementation(async (event, manager) => {
      if (event.entidad === 'asistencias' && ++marks === 2)
        throw new Error('Fallo interno sintético B12');
      await original(event, manager);
    });
    const response = await save(
      f.session,
      f.enrollments.map((m) => entry(m)),
    ).expect(500);
    expect(response.body.message).toBe('Error interno del servidor');
    expect(await count(f.session)).toBe(0);
    expect(
      (
        await source.query('SELECT estado FROM sesiones_clase WHERE id=$1', [
          f.session.id,
        ])
      )[0].estado,
    ).toBe('PROGRAMADA');
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE (entidad='asistencias' AND valor_nuevo->>'sesion_id'=$1) OR (entidad='sesiones_clase' AND entidad_id=$1)",
        [f.session.id],
      ),
    ).toEqual([]);
  });
  it.each(['secretaria', 'coordinador'])(
    '%s consulta todas las matrículas pero no registra marcas',
    async (name) => {
      const f = await matrix(1);
      const user = await login(name);
      const response = (await call('get', path(f.session), user).expect(200))
        .body;
      expect(response.puedeEditar).toBe(false);
      expect(response.items).toHaveLength(1);
      await save(f.session, [entry(f.enrollments[0]!)], user).expect(403);
      expect(await count(f.session)).toBe(0);
    },
  );
  it('el administrador consulta, pero no edita asistencia abierta sin ser docente asignado', async () => {
    const f = await matrix(1);
    const response = (await call('get', path(f.session), admin).expect(200))
      .body;
    expect(response.puedeEditar).toBe(false);
    expect(response.items[0].editable).toBe(false);
    await save(f.session, [entry(f.enrollments[0]!)], admin).expect(403);
    expect(await count(f.session)).toBe(0);
  });
  it('un docente ajeno no consulta ni altera el grupo mediante navegación directa', async () => {
    const f = await matrix(1);
    const user = await login('ajeno');
    await call('get', path(f.session), user).expect(403);
    await save(f.session, [entry(f.enrollments[0]!)], user).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/${path(f.session)}`)
      .expect(401);
  });
  it.each(['SECRETARIA', 'ADMIN'] as const)(
    'un docente con rol %s adicional sigue escribiendo solo sus grupos',
    async (role) => {
      const own = await matrix(1);
      const other = await fixture.group(false);
      const otherSession = await fixture.session(other);
      const otherEnrollment = await fixture.enroll(
        other,
        await fixture.student(),
      );
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [fixture.userIds.docente, adminId, role],
      );
      try {
        const user = await login('docente');
        expect(
          (await call('get', path(otherSession), user).expect(200)).body
            .puedeEditar,
        ).toBe(false);
        await save(otherSession, [entry(otherEnrollment)], user).expect(403);
        await save(own.session, [entry(own.enrollments[0]!)], user).expect(200);
      } finally {
        await source.query(
          'DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo=$2)',
          [fixture.userIds.docente, role],
        );
      }
    },
  );
  it('revocar la asignación invalida la escritura de una sesión de usuario previa', async () => {
    const f = await matrix(1);
    const user = await login('docente');
    await call('get', path(f.session), user).expect(200);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [f.group.id, fixture.teacherId],
    );
    await call('get', path(f.session), user).expect(403);
    await save(f.session, [entry(f.enrollments[0]!)], user).expect(403);
    expect(await count(f.session)).toBe(0);
  });
  it.each(['docentes', 'personas'])(
    'inactivar %s impide registrar con una sesión ya iniciada',
    async (table) => {
      const f = await matrix(1);
      const user = await login('docente');
      const id =
        table === 'docentes' ? fixture.teacherId : fixture.teacherPersonId;
      await source.query(`UPDATE ${table} SET activo=false WHERE id=$1`, [id]);
      try {
        await save(f.session, [entry(f.enrollments[0]!)], user).expect(403);
        expect(await count(f.session)).toBe(0);
      } finally {
        await source.query(`UPDATE ${table} SET activo=true WHERE id=$1`, [id]);
      }
    },
  );
  it.each([
    'grupo cerrado',
    'periodo cerrado',
    'grupo planificado',
    'periodo planificado',
  ])(
    '%s permite consultar y bloquea el registro para todos los escritores',
    async (state) => {
      const f = await matrix(1);
      const target = state.startsWith('grupo')
        ? 'grupos'
        : 'periodos_academicos';
      await source.query(`UPDATE ${target} SET estado=$1 WHERE id=$2`, [
        state.endsWith('cerrado') ? 'CERRADO' : 'PLANIFICADO',
        target === 'grupos' ? f.group.id : f.group.periodo_id,
      ]);
      expect(
        (await call('get', path(f.session)).expect(200)).body.puedeEditar,
      ).toBe(false);
      await save(f.session, [entry(f.enrollments[0]!)]).expect(409);
      await save(
        f.session,
        [entry(f.enrollments[0]!)],
        await login('docente2'),
      ).expect(409);
      await save(f.session, [entry(f.enrollments[0]!)], admin).expect(403);
      expect(await count(f.session)).toBe(0);
    },
  );
  it.each(['cancelada', 'futura'])(
    'una sesión %s conserva consulta y rechaza confirmar asistencia',
    async (state) => {
      const f = await matrix(1);
      if (state === 'cancelada')
        await source.query(
          "UPDATE sesiones_clase SET estado='CANCELADA' WHERE id=$1",
          [f.session.id],
        );
      else
        await source.query('UPDATE sesiones_clase SET fecha=$1 WHERE id=$2', [
          fixture.tomorrow,
          f.session.id,
        ]);
      expect(
        (await call('get', path(f.session)).expect(200)).body.puedeEditar,
      ).toBe(false);
      await save(f.session, [entry(f.enrollments[0]!)]).expect(409);
      expect(await count(f.session)).toBe(0);
    },
  );
  it.each(['PENDIENTE', 'CERRADA', 'ANULADA'] as const)(
    'la matrícula %s no admite registrar y no sustituye un intento activo',
    async (state) => {
      const f = await matrix(1);
      const inactive = await fixture.enroll(
        f.group,
        await fixture.student(),
        state,
      );
      await save(f.session, [entry(f.enrollments[0]!), entry(inactive)]).expect(
        409,
      );
      expect(await count(f.session)).toBe(0);
    },
  );
  it('conserva marcas de intentos cerrados por separado y las muestra en solo lectura', async () => {
    const f = await matrix(1);
    const old = f.enrollments[0]!;
    await save(f.session, [entry(old, 'F')]).expect(200);
    await source.query("UPDATE matriculas SET estado='CERRADA' WHERE id=$1", [
      old.id,
    ]);
    const current = await fixture.enroll(f.group, f.students[0]!);
    expect(current.numero_intento).toBe(2);
    await save(f.session, [entry(current, 'P')]).expect(200);
    const response = (await call('get', path(f.session), writer).expect(200))
      .body;
    expect(response.items).toHaveLength(2);
    expect(
      response.items.find(
        (row: { matricula_id: string }) => row.matricula_id === old.id,
      ),
    ).toMatchObject({
      editable: false,
      numero_intento: 1,
      estado_matricula: 'CERRADA',
      asistencia: { codigo: 'F', version: 1 },
    });
    expect(
      response.items.find(
        (row: { matricula_id: string }) => row.matricula_id === current.id,
      ),
    ).toMatchObject({
      editable: true,
      numero_intento: 2,
      estado_matricula: 'ACTIVA',
      asistencia: { codigo: 'P', version: 1 },
    });
    await save(f.session, [entry(old, 'P', 1)]).expect(409);
    expect(await count(f.session)).toBe(2);
  });
  it('rechaza matrículas y sesiones de otros grupos sin persistir las filas válidas', async () => {
    const a = await matrix(1);
    const b = await matrix(1);
    await save(a.session, [
      entry(a.enrollments[0]!),
      entry(b.enrollments[0]!),
    ]).expect(400);
    await call(
      'get',
      `asistencia/grupos/${a.group.id}/sesiones/${b.session.id}/asistencias`,
    ).expect(404);
    await call(
      'patch',
      `asistencia/grupos/${a.group.id}/sesiones/${b.session.id}/asistencias`,
    )
      .send({ registros: [entry(a.enrollments[0]!)] })
      .expect(404);
    expect(await count(a.session)).toBe(0);
    expect(await count(b.session)).toBe(0);
  });
  it('valida códigos, versiones, duplicados y observaciones del lote', async () => {
    const f = await matrix(1);
    const row = entry(f.enrollments[0]!);
    const malformed = [
      {},
      { registros: [] },
      { registros: [row, row] },
      { registros: Array.from({ length: 101 }, () => row) },
      ...['A', 'p', '', null].map((codigo) => ({
        registros: [{ ...row, codigo }],
      })),
      ...[0, -1, 1.5, '1', 2147483648, undefined].map((version) => ({
        registros: [{ ...row, version }],
      })),
      { registros: [{ ...row, observacion: 'x'.repeat(251) }] },
      { registros: [{ ...row, observacion: 10 }] },
      { registros: [{ ...row, registradoPor: adminId }] },
      { registros: [{ ...row, matriculaId: '0' }] },
    ];
    for (const body of malformed)
      await call('patch', path(f.session)).send(body).expect(400);
    expect(await count(f.session)).toBe(0);
    await save(f.session, [{ ...row, observacion: 'x'.repeat(250) }]).expect(
      200,
    );
  });
  it('exige CSRF y vuelve a verificar una sesión de usuario revocada', async () => {
    const f = await matrix(1);
    const user = await login('docente');
    await request(app.getHttpServer())
      .patch(`/api/v1/${path(f.session)}`)
      .set('Origin', origin)
      .set('Cookie', user.cookie)
      .set('X-Requested-With', 'Excel-Web')
      .send({ registros: [entry(f.enrollments[0]!)] })
      .expect(403);
    await source.query(
      'UPDATE sesiones_usuario SET revocado_at=now() WHERE usuario_id=$1',
      [fixture.userIds.docente],
    );
    await save(f.session, [entry(f.enrollments[0]!)], user).expect(401);
    expect(await count(f.session)).toBe(0);
  });
  it('la base mantiene unicidad y FK de sesión, grupo e intento y rechaza marcas inválidas', async () => {
    const a = await matrix(1);
    const b = await matrix(1);
    await save(a.session, [entry(a.enrollments[0]!)]).expect(200);
    const insert = (g: string, s: string, m: string, code: string) =>
      source.query(
        'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5)',
        [g, s, m, code, adminId],
      );
    await expect(
      insert(a.group.id, a.session.id, a.enrollments[0]!.id, 'F'),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(
      insert(a.group.id, a.session.id, b.enrollments[0]!.id, 'P'),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      insert(a.group.id, b.session.id, a.enrollments[0]!.id, 'P'),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      insert(b.group.id, b.session.id, b.enrollments[0]!.id, 'X'),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      source.query('DELETE FROM asistencias WHERE sesion_id=$1', [
        a.session.id,
      ]),
    ).rejects.toThrow();
    expect(await count(a.session)).toBe(1);
  });
  it('la base conserva el origen del registro y la versión es siempre positiva', async () => {
    const f = await matrix(2);
    const saved = (
      await save(
        f.session,
        [entry(f.enrollments[0]!)],
        await login('docente'),
      ).expect(200)
    ).body.items[0] as Mark;
    const secondSession = await fixture.session(
      f.group,
      'PROGRAMADA',
      fixture.yesterday,
    );
    const updates: [string, unknown][] = [
      ['grupo_id', (await fixture.group()).id],
      ['sesion_id', secondSession.id],
      ['matricula_id', f.enrollments[1]!.id],
      ['registrado_por', adminId],
      ['registrado_at', '2000-01-01T00:00:00Z'],
    ];
    for (const [column, value] of updates)
      await expect(
        source.query(`UPDATE asistencias SET ${column}=$1 WHERE id=$2`, [
          value,
          saved.id,
        ]),
      ).rejects.toThrow();
    await expect(
      source.query('UPDATE asistencias SET version=0 WHERE id=$1', [saved.id]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const [unchanged] = await source.query(
      'SELECT grupo_id,sesion_id,matricula_id,registrado_por,version FROM asistencias WHERE id=$1',
      [saved.id],
    );
    expect(unchanged).toEqual({
      grupo_id: f.group.id,
      sesion_id: f.session.id,
      matricula_id: f.enrollments[0]!.id,
      registrado_por: fixture.userIds.docente,
      version: 1,
    });
  });
  it('no revierte la migración de versiones cuando ya hay historial de asistencia', async () => {
    const f = await matrix(1);
    await save(f.session, [entry(f.enrollments[0]!)]).expect(200);
    const before = await source.query(
      'SELECT name FROM migraciones ORDER BY id',
    );
    expect(
      (await source.query('SELECT count(*)::int AS n FROM asistencias'))[0].n,
    ).toBeGreaterThan(0);
    await expect(
      checkMigrationReversal(source, new Asistencia1790208009000()),
    ).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    expect(
      await source.query('SELECT name FROM migraciones ORDER BY id'),
    ).toEqual(before);
    expect(
      (
        await source.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='asistencias' AND column_name='version'",
        )
      )[0].column_name,
    ).toBe('version');
  });
  it('pagina el roster sin repetir intentos y publica ambos contratos OpenAPI', async () => {
    const f = await matrix(3);
    const first = (
      await call('get', `${path(f.session)}?limit=2&after=0`).expect(200)
    ).body;
    const second = (
      await call(
        'get',
        `${path(f.session)}?limit=2&after=${first.nextCursor}`,
      ).expect(200)
    ).body;
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.items, ...second.items].map(
          (row: { matricula_id: string }) => row.matricula_id,
        ),
      ).size,
    ).toBe(3);
    for (const query of ['limit=101', 'after=-1', 'extra=1'])
      await call('get', `${path(f.session)}?${query}`).expect(400);
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const contract =
      spec.paths[
        '/api/v1/asistencia/grupos/{grupoId}/sesiones/{sesionId}/asistencias'
      ];
    expect(contract.get.responses['200']).toBeDefined();
    expect(contract.patch.responses['200']).toBeDefined();
    expect(contract.patch.requestBody).toBeDefined();
  });
});
