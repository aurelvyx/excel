import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { AttendanceCalculationService } from '../src/modules/asistencia/attendance-calculation.service.js';
import type { AttendanceSummary } from '../src/modules/asistencia/attendance-calculation.policy.js';
import { CierresAsistencia1790208011000 } from '../src/database/migraciones/1790208011000-cierres-asistencia.js';
import { checkMigrationReversal } from './migration-test.js';
import { freePort } from './browser-server.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureGroup,
  type AttendanceFixtureSession,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B15 con pnpm test:db');

const password = 'Sintetica-segura-B15';
type Login = { cookie: string; csrf: string };
type Code = 'P' | 'F' | 'T' | 'J';
type Mark = {
  id: string;
  codigo: Code;
  observacion: string | null;
  version: number;
};
type Closure = {
  id: string;
  grupo_id: string;
  tipo: string;
  estado: string;
  revision: string;
  realizado_por: string;
  realizado_at: string;
  motivo: string | null;
  resumen: unknown;
};
type ClosureView = {
  grupo: { id: string; estado: string; asistencia_cerrada: boolean };
  hoy: string;
  cierre: Closure | null;
  revision: string;
  puedeCerrar: boolean;
  motivoSoloLectura: string | null;
  advertencias: {
    sesionesComputables: number;
    sesionesProgramadas: number;
    sesionesFuturas: number;
    sesionesCanceladas: number;
    matriculasRevisables: number;
    marcasPendientes: number;
    justificacionesPendientes: number;
  };
  items: {
    matricula_id: string;
    resumenAsistencia: AttendanceSummary;
  }[];
  historial: { accion: string; usuario_id: string; ocurrido_at: string }[];
};
type Matrix = {
  puedeEditar: boolean;
  puedeCorregir: boolean;
  items: {
    matricula_id: string;
    editable: boolean;
    corregible: boolean;
    asistencia: Mark | null;
    resumenAsistencia: AttendanceSummary;
  }[];
};
type History = {
  asistencia: Mark | null;
  cierre: Closure | null;
  items: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
    valor_anterior: Mark | null;
    valor_nuevo: Mark;
  }[];
};

describe('B15 cierre y corrección de asistencia HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let teacher: Login;
  let secretary: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  const previousOrigins = process.env.WEB_ORIGINS;

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_attendance_closure_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_closure_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b15', password);
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
    admin = await login('admin_b15');
    teacher = await login('docente');
    secretary = await login('secretaria');
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

  async function login(name: string): Promise<Login> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Requested-With', 'Excel-Web')
      .send({ nombreUsuario: name, password })
      .expect(200);
    return {
      cookie: (response.headers['set-cookie'] as unknown as string[])[0]!.split(
        ';',
      )[0]!,
      csrf: response.body.csrfToken,
    };
  }
  function call(
    method: 'get' | 'post' | 'patch',
    route: string,
    actor = admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/${route}`)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const closurePath = (group: AttendanceFixtureGroup) =>
    `asistencia/grupos/${group.id}/cierre`;
  const attendancePath = (session: AttendanceFixtureSession) =>
    `asistencia/grupos/${session.grupo_id}/sesiones/${session.id}/asistencias`;
  async function view(group: AttendanceFixtureGroup, actor = admin) {
    return (await call('get', closurePath(group), actor).expect(200))
      .body as ClosureView;
  }
  async function close(
    group: AttendanceFixtureGroup,
    confirmarPendientes = false,
    patch: Record<string, unknown> = {},
    expectedStatus = 201,
  ) {
    const reviewed = await view(group);
    return call('post', closurePath(group))
      .send({
        revision: reviewed.revision,
        confirmarPendientes,
        ...patch,
      })
      .expect(expectedStatus);
  }
  async function dateAgo(days: number): Promise<string> {
    const [row] = await source.query(
      'SELECT ($1::date-$2::int)::text AS fecha',
      [fixture.today, days],
    );
    return row.fecha as string;
  }
  async function mark(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    codigo: Code,
  ): Promise<Mark> {
    const [row] = await source.query(
      'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id,codigo,observacion,version',
      [
        session.grupo_id,
        session.id,
        enrollment.id,
        codigo,
        fixture.userIds.docente,
      ],
    );
    return row as Mark;
  }
  async function dataset(
    codes: readonly (Code | null)[] = ['P'],
    state: 'ACTIVA' | 'CERRADA' = 'ACTIVA',
    parameterId?: string,
  ) {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student, state, parameterId);
    const sessions: AttendanceFixtureSession[] = [];
    const marks: (Mark | null)[] = [];
    for (const [index, code] of codes.entries()) {
      const session = await fixture.session(
        group,
        'REALIZADA',
        await dateAgo(index),
      );
      sessions.push(session);
      marks.push(code === null ? null : await mark(session, enrollment, code));
    }
    return { group, student, enrollment, sessions, marks };
  }
  async function matrix(session: AttendanceFixtureSession, actor = admin) {
    return (await call('get', attendancePath(session), actor).expect(200))
      .body as Matrix;
  }
  const correctionBody = (
    enrollment: AttendanceFixtureEnrollment,
    attendance: Mark | null,
    closure: Closure,
    patch: Record<string, unknown> = {},
  ) => ({
    matriculaId: enrollment.id,
    codigo: attendance?.codigo ?? 'P',
    version: attendance?.version ?? null,
    motivo: 'Corrección administrativa sintética B15',
    cierreId: closure.id,
    ...patch,
  });
  function correct(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    attendance: Mark | null,
    closure: Closure,
    patch: Record<string, unknown> = {},
    actor = admin,
  ) {
    return call('patch', `${attendancePath(session)}/correccion`, actor).send(
      correctionBody(enrollment, attendance, closure, patch),
    );
  }
  async function history(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    actor = admin,
  ) {
    return (
      await call(
        'get',
        `${attendancePath(session)}/${enrollment.id}/historial`,
        actor,
      ).expect(200)
    ).body as History;
  }
  async function persisted(group: AttendanceFixtureGroup) {
    const [
      groups,
      enrollments,
      sessions,
      attendance,
      justifications,
      closures,
      results,
      audit,
    ] = await Promise.all([
      source.query('SELECT * FROM grupos WHERE id=$1', [group.id]),
      source.query('SELECT * FROM matriculas WHERE grupo_id=$1 ORDER BY id', [
        group.id,
      ]),
      source.query(
        'SELECT * FROM sesiones_clase WHERE grupo_id=$1 ORDER BY id',
        [group.id],
      ),
      source.query('SELECT * FROM asistencias WHERE grupo_id=$1 ORDER BY id', [
        group.id,
      ]),
      source.query(
        'SELECT j.* FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=$1 ORDER BY j.id',
        [group.id],
      ),
      source.query(
        'SELECT * FROM cierres_academicos WHERE grupo_id=$1 ORDER BY id',
        [group.id],
      ),
      source.query(
        'SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1 ORDER BY r.id',
        [group.id],
      ),
      source.query(
        `SELECT e.* FROM auditoria_eventos e WHERE
        (e.entidad='grupos' AND e.entidad_id=$1::text)
        OR (e.entidad='matriculas' AND e.entidad_id IN (SELECT id::text FROM matriculas WHERE grupo_id=$1::bigint))
        OR (e.entidad='sesiones_clase' AND e.entidad_id IN (SELECT id::text FROM sesiones_clase WHERE grupo_id=$1::bigint))
        OR (e.entidad='asistencias' AND e.entidad_id IN (SELECT id::text FROM asistencias WHERE grupo_id=$1::bigint))
        OR (e.entidad='justificaciones' AND e.entidad_id IN (SELECT j.id::text FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=$1::bigint))
        OR (e.entidad='cierres_academicos' AND e.entidad_id IN (SELECT id::text FROM cierres_academicos WHERE grupo_id=$1::bigint)) ORDER BY e.id`,
        [group.id],
      ),
    ]);
    return {
      groups,
      enrollments,
      sessions,
      attendance,
      justifications,
      closures,
      results,
      audit,
    };
  }
  async function justification(
    group: AttendanceFixtureGroup,
    attendance: Mark,
    approve = false,
  ) {
    const base = `asistencia/grupos/${group.id}/justificaciones`;
    const created = (
      await call('post', base, secretary)
        .send({
          asistenciaId: attendance.id,
          asistenciaVersion: attendance.version,
          motivo: 'Expediente sintético B15',
          fechaPresentacion: fixture.today,
        })
        .expect(201)
    ).body.justificacion as { id: string; version: number; estado: string };
    if (!approve) return created;
    return (
      await call('patch', `${base}/${created.id}/resolucion`, secretary)
        .send({
          estado: 'APROBADA',
          version: created.version,
          observacion: 'Aprobación sintética previa al cierre',
        })
        .expect(200)
    ).body.justificacion as { id: string; version: number; estado: string };
  }

  it('presenta una revisión estable y cierra asistencia sin cerrar grupo, matrícula ni resultado', async () => {
    const f = await dataset(['F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);
    const before = await persisted(f.group);
    const reviewed = await view(f.group);
    expect(reviewed).toMatchObject({
      cierre: null,
      puedeCerrar: true,
      hoy: fixture.today,
      advertencias: {
        sesionesComputables: 10,
        matriculasRevisables: 1,
        marcasPendientes: 0,
        justificacionesPendientes: 0,
      },
    });
    expect(reviewed.revision).toMatch(/^[a-f0-9]{64}$/);
    expect((await view(f.group)).revision).toBe(reviewed.revision);
    const response = await call('post', closurePath(f.group))
      .send({
        revision: reviewed.revision,
        confirmarPendientes: false,
        motivo: 'Cierre sintético revisado',
      })
      .expect(201);
    const closed = response.body as ClosureView;
    expect(closed.cierre).toMatchObject({
      grupo_id: f.group.id,
      tipo: 'ASISTENCIA',
      estado: 'CERRADO',
      realizado_por: adminId,
      realizado_at: expect.any(String),
      revision: reviewed.revision,
      motivo: 'Cierre sintético revisado',
    });
    expect(closed.puedeCerrar).toBe(false);
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      sesionesComputables: 10,
      inasistenciaPct: '30.00',
      condicion: 'DENTRO_LIMITE',
    });
    const after = await persisted(f.group);
    expect(after.groups).toEqual(before.groups);
    expect(after.enrollments).toEqual(before.enrollments);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.results).toEqual(before.results);
    expect(after.closures).toHaveLength(1);
    const [event] = await source.query(
      "SELECT usuario_id,accion,valor_nuevo FROM auditoria_eventos WHERE entidad='cierres_academicos' AND entidad_id=$1",
      [closed.cierre!.id],
    );
    expect(event).toMatchObject({
      usuario_id: adminId,
      accion: 'CLOSE_ATTENDANCE',
      valor_nuevo: expect.any(Object),
    });
    expect(
      after.closures[0].resumen.intentos[0].resumenAsistencia.cierreConfirmado,
    ).toBe(false);
    expect(
      event.valor_nuevo.resumenesCerrados[0].resumenAsistencia.cierreConfirmado,
    ).toBe(true);
    expect(closed.historial).toHaveLength(1);
  });

  it.each(['docente', 'docente2', 'secretaria', 'coordinador'])(
    'permite consulta a %s y deniega su cierre',
    async (name) => {
      const f = await dataset();
      const actor = await login(name);
      const reviewed = await view(f.group, actor);
      expect(reviewed.puedeCerrar).toBe(false);
      expect(reviewed.motivoSoloLectura).toEqual(expect.any(String));
      const before = await persisted(f.group);
      await call('post', closurePath(f.group), actor)
        .send({
          revision: reviewed.revision,
          confirmarPendientes: true,
        })
        .expect(403);
      expect(await persisted(f.group)).toEqual(before);
    },
  );

  it('un docente ajeno no consulta cierre, matriz ni historial; un rol de consulta no concede corrección', async () => {
    const f = await dataset();
    const foreign = await login('ajeno');
    const closed = (await close(f.group)).body as ClosureView;
    for (const route of [
      closurePath(f.group),
      attendancePath(f.sessions[0]!),
      `${attendancePath(f.sessions[0]!)}/${f.enrollment.id}/historial`,
    ])
      await call('get', route, foreign).expect(403);
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
      [fixture.userIds.ajeno, adminId],
    );
    expect((await view(f.group, foreign)).puedeCerrar).toBe(false);
    await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      closed.cierre!,
      { codigo: 'F' },
      foreign,
    ).expect(403);
  });

  it('advierte pendientes y exige confirmarlos sin convertir marcas vacías en F ni resolver J', async () => {
    const f = await dataset(['J', 'J', null, 'P']);
    const pending = await justification(f.group, f.marks[0]!);
    const approved = await justification(f.group, f.marks[1]!, true);
    await fixture.session(f.group, 'PROGRAMADA', await dateAgo(7));
    await fixture.session(f.group, 'PROGRAMADA', fixture.tomorrow);
    await fixture.session(f.group, 'CANCELADA', await dateAgo(8));
    const reviewed = await view(f.group);
    expect(reviewed.advertencias).toMatchObject({
      sesionesComputables: 4,
      sesionesProgramadas: 2,
      sesionesFuturas: 1,
      sesionesCanceladas: 1,
      marcasPendientes: 1,
      justificacionesPendientes: 2,
    });
    const before = await persisted(f.group);
    await call('post', closurePath(f.group))
      .send({
        revision: reviewed.revision,
        confirmarPendientes: false,
      })
      .expect(409);
    expect(await persisted(f.group)).toEqual(before);
    const closed = (await close(f.group, true)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      estado: 'INCOMPLETO',
      condicion: null,
      marcasPendientes: 1,
      justificadasPendientes: 2,
      faltasConfirmadas: 2,
      faltasComputables: 2,
    });
    const after = await persisted(f.group);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.justifications).toEqual(before.justifications);
    expect(after.justifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pending.id, estado: 'PENDIENTE' }),
        expect.objectContaining({ id: approved.id, estado: 'APROBADA' }),
      ]),
    );
  });

  it.each(['sin sesiones', 'sin matrículas'])(
    'advierte un grupo %s y no determina condición definitiva',
    async (variant) => {
      const group = await fixture.group();
      if (variant === 'sin sesiones')
        await fixture.enroll(group, await fixture.student());
      else await fixture.session(group, 'REALIZADA');
      const reviewed = await view(group);
      expect(
        reviewed.advertencias[
          variant === 'sin sesiones'
            ? 'sesionesComputables'
            : 'matriculasRevisables'
        ],
      ).toBe(0);
      await close(group, false, {}, 409);
      const closed = (await close(group, true)).body as ClosureView;
      expect(closed.cierre).not.toBeNull();
      for (const item of closed.items)
        expect(item.resumenAsistencia).toMatchObject({
          estado: 'SIN_SESIONES',
          condicion: null,
          inasistenciaPct: null,
        });
    },
  );

  it('al cerrar J sin solicitud computa como falta, conserva J y permite el 30 % exacto', async () => {
    const f = await dataset(['F', 'F', 'J', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);
    expect(
      (await view(f.group)).items[0]!.resumenAsistencia.condicion,
    ).toBeNull();
    const closed = (await close(f.group, true)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      estado: 'CALCULADO',
      justificadasPendientes: 1,
      faltasConfirmadas: 3,
      inasistenciaPct: '30.00',
      condicion: 'DENTRO_LIMITE',
    });
    expect((await persisted(f.group)).justifications).toHaveLength(0);
    expect((await persisted(f.group)).attendance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: f.marks[2]!.id, codigo: 'J' }),
      ]),
    );
  });

  it('J recuperada sigue descontada al cierre y tres tardanzas equivalen a una falta', async () => {
    const f = await dataset(['J', 'T', 'T', 'T', 'P', 'P', 'P', 'P', 'P', 'P']);
    const approved = await justification(f.group, f.marks[0]!, true);
    await call(
      'patch',
      `asistencia/grupos/${f.group.id}/justificaciones/${approved.id}/recuperacion`,
      teacher,
    )
      .send({
        estado: 'RECUPERADA',
        version: approved.version,
      })
      .expect(200);
    const closed = (await close(f.group)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      justificadasRecuperadas: 1,
      justificadasPendientes: 0,
      faltasPorTardanzas: 1,
      tardanzasRestantes: 0,
      inasistenciaPct: '10.00',
      condicion: 'DENTRO_LIMITE',
    });
  });

  it('rechaza una revisión obsoleta después de cambiar marca, sesión o solicitud', async () => {
    const f = await dataset(['J']);
    const first = await view(f.group);
    await call('patch', attendancePath(f.sessions[0]!), teacher)
      .send({
        registros: [
          {
            matriculaId: f.enrollment.id,
            codigo: 'J',
            version: 1,
            observacion: 'Actualización sintética',
          },
        ],
      })
      .expect(200);
    await call('post', closurePath(f.group))
      .send({ revision: first.revision, confirmarPendientes: true })
      .expect(409);
    const second = await view(f.group);
    expect(second.revision).not.toBe(first.revision);
    await fixture.session(f.group, 'PROGRAMADA', await dateAgo(1));
    await call('post', closurePath(f.group))
      .send({ revision: second.revision, confirmarPendientes: true })
      .expect(409);
    const third = await view(f.group);
    expect(third.revision).not.toBe(second.revision);
    await justification(f.group, { ...f.marks[0]!, version: 2 });
    await call('post', closurePath(f.group))
      .send({ revision: third.revision, confirmarPendientes: true })
      .expect(409);
    expect((await view(f.group)).revision).not.toBe(third.revision);
    expect((await persisted(f.group)).closures).toHaveLength(0);
  });

  it('dos confirmaciones concurrentes producen exactamente un cierre y una auditoría', async () => {
    const f = await dataset();
    const reviewed = await view(f.group);
    const responses = await Promise.all(
      [0, 1].map(() =>
        call('post', closurePath(f.group)).send({
          revision: reviewed.revision,
          confirmarPendientes: false,
        }),
      ),
    );
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const rows = (await persisted(f.group)).closures;
    expect(rows).toHaveLength(1);
    const [audits] = await source.query(
      "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='cierres_academicos' AND entidad_id=$1",
      [rows[0].id],
    );
    expect(audits.n).toBe(1);
    await close(f.group, true, {}, 409);
  });

  it('el cierre bloquea matrícula, sesiones, marcas y todas las decisiones ordinarias de B14', async () => {
    const f = await dataset(['J', 'J', 'J']);
    const pending = await justification(f.group, f.marks[0]!);
    const approved = await justification(f.group, f.marks[1]!, true);
    const student = await fixture.student();
    const waiting = (
      await call('post', 'matriculas', secretary)
        .send({ estudianteId: student.id, grupoId: f.group.id })
        .expect(201)
    ).body as { id: string };
    const [voucher] = await source.query(
      "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe,estado,validado_por,validado_at) VALUES($1,$2,$3,80,'VALIDADO',$4,now()) RETURNING id",
      [student.id, `SYN-B15-WAIT-${waiting.id}`, fixture.today, adminId],
    );
    await close(f.group, true);
    const before = await persisted(f.group);
    for (const actor of [teacher, admin])
      await call('post', `asistencia/grupos/${f.group.id}/sesiones`, actor)
        .send({ fechas: [await dateAgo(9)] })
        .expect(409);
    await call('patch', attendancePath(f.sessions[0]!), teacher)
      .send({
        registros: [{ matriculaId: f.enrollment.id, codigo: 'P', version: 1 }],
      })
      .expect(409);
    const base = `asistencia/grupos/${f.group.id}/justificaciones`;
    for (const actor of [secretary, admin]) {
      await call('post', base, actor)
        .send({
          asistenciaId: f.marks[2]!.id,
          asistenciaVersion: 1,
          motivo: 'Solicitud tras cierre',
          fechaPresentacion: fixture.today,
        })
        .expect(409);
      await call('patch', `${base}/${pending.id}/resolucion`, actor)
        .send({
          estado: 'APROBADA',
          version: pending.version,
          observacion: 'Resolución tras cierre',
        })
        .expect(409);
    }
    for (const actor of [teacher, admin])
      await call('patch', `${base}/${approved.id}/recuperacion`, actor)
        .send({ estado: 'RECUPERADA', version: approved.version })
        .expect(409);
    await call('post', 'matriculas', secretary)
      .send({ estudianteId: student.id, grupoId: f.group.id })
      .expect(409);
    await call('patch', `matriculas/${waiting.id}/activar`, secretary)
      .send({ voucherId: voucher.id, confirmado: true })
      .expect(409);
    expect(await persisted(f.group)).toEqual(before);
    const sessions = (
      await call('get', `asistencia/grupos/${f.group.id}/sesiones`).expect(200)
    ).body;
    expect(sessions.puedeProgramar).toBe(false);
    expect(sessions.grupo.asistencia_cerrada).toBe(true);
    const marks = await matrix(f.sessions[0]!, teacher);
    expect(marks.puedeEditar).toBe(false);
    expect(marks.puedeCorregir).toBe(false);
    expect(marks.items[0]!.editable).toBe(false);
  });

  it('reabrir el catálogo de grupo o periodo no elimina el cierre específico de asistencia', async () => {
    const f = await dataset();
    await close(f.group);
    await call('patch', `oferta/grupos/${f.group.id}`)
      .send({ estado: 'CERRADO', motivo: 'Cambio sintético de catálogo' })
      .expect(200);
    await call('patch', `oferta/grupos/${f.group.id}`)
      .send({ estado: 'ACTIVO', motivo: 'Reactivación sintética de catálogo' })
      .expect(200);
    expect((await view(f.group)).cierre).not.toBeNull();
    expect((await matrix(f.sessions[0]!, teacher)).puedeEditar).toBe(false);
    await call('patch', attendancePath(f.sessions[0]!), teacher)
      .send({
        registros: [{ matriculaId: f.enrollment.id, codigo: 'F', version: 1 }],
      })
      .expect(409);
  });

  it('solo ADMIN corrige después del cierre con motivo, versión y auditoría antes/después', async () => {
    const f = await dataset(['F', 'F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P']);
    const closed = (await close(f.group)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia.condicion).toBe(
      'RETIRADO_INASISTENCIA',
    );
    const before = await persisted(f.group);
    for (const name of ['docente', 'docente2', 'secretaria', 'coordinador'])
      await correct(
        f.sessions[0]!,
        f.enrollment,
        f.marks[0]!,
        closed.cierre!,
        { codigo: 'P' },
        await login(name),
      ).expect(403);
    expect(await persisted(f.group)).toEqual(before);
    const adminMatrix = await matrix(f.sessions[0]!);
    expect(adminMatrix).toMatchObject({
      puedeEditar: false,
      puedeCorregir: true,
    });
    expect(adminMatrix.items[0]!).toMatchObject({
      editable: false,
      corregible: true,
    });
    const corrected = await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      closed.cierre!,
      {
        codigo: 'P',
        observacion: ' Evidencia revisada ',
        motivo: ' Rectificación sintética documentada ',
      },
    ).expect(200);
    expect(corrected.body.items[0]).toMatchObject({
      id: f.marks[0]!.id,
      codigo: 'P',
      observacion: 'Evidencia revisada',
      version: 2,
    });
    expect(corrected.body.resumenes[0].resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      inasistenciaPct: '30.00',
      condicion: 'DENTRO_LIMITE',
    });
    const evidence = await history(f.sessions[0]!, f.enrollment);
    expect(evidence.cierre!.id).toBe(closed.cierre!.id);
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      usuario_id: adminId,
      nombre_usuario: 'admin_b15',
      ocurrido_at: expect.any(String),
      motivo: 'Rectificación sintética documentada',
      valor_anterior: { codigo: 'F', observacion: null, version: 1 },
      valor_nuevo: {
        codigo: 'P',
        observacion: 'Evidencia revisada',
        version: 2,
      },
    });
    expect(evidence.items[0]).not.toHaveProperty('ip_origen');
    expect(Object.keys(evidence.items[0]!.valor_nuevo).sort()).toEqual([
      'codigo',
      'observacion',
      'version',
    ]);
    const after = await persisted(f.group);
    expect(after.closures).toEqual(before.closures);
    expect(after.enrollments).toEqual(before.enrollments);
    expect(after.results).toEqual(before.results);
    const studentHistory = (
      await call(
        'get',
        `estudiantes/${f.student.id}/historial/${f.enrollment.id}`,
      ).expect(200)
    ).body;
    expect(studentHistory.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      inasistenciaPct: '30.00',
    });
  });

  it('ADMIN puede completar una marca pendiente tras cierre sin fabricar falta y con origen auditable', async () => {
    const f = await dataset([null, 'P']);
    const closed = (await close(f.group, true)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      estado: 'INCOMPLETO',
      condicion: null,
    });
    const response = await correct(
      f.sessions[0]!,
      f.enrollment,
      null,
      closed.cierre!,
      { codigo: 'T' },
    ).expect(200);
    expect(response.body.items[0]).toMatchObject({
      codigo: 'T',
      version: 1,
      registrado_por: adminId,
    });
    expect(response.body.resumenes[0].resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      cierreConfirmado: true,
      marcasPendientes: 0,
      tardanzas: 1,
      condicion: 'DENTRO_LIMITE',
    });
    const evidence = await history(f.sessions[0]!, f.enrollment, secretary);
    expect(evidence.items[0]).toMatchObject({
      usuario_id: adminId,
      motivo: expect.any(String),
      valor_anterior: null,
      valor_nuevo: { codigo: 'T', observacion: null, version: 1 },
    });
  });

  it('rechaza corrección previa al cierre, cierre ajeno, sesión ajena o cancelada/futura y matrícula ajena', async () => {
    const f = await dataset();
    const other = await dataset();
    const otherClosed = (await close(other.group)).body as ClosureView;
    await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      otherClosed.cierre!,
      { codigo: 'F' },
    ).expect(409);
    const cancelled = await fixture.session(
      f.group,
      'CANCELADA',
      await dateAgo(2),
    );
    const future = await fixture.session(
      f.group,
      'REALIZADA',
      fixture.tomorrow,
    );
    const closed = (await close(f.group, true)).body as ClosureView;
    const before = await persisted(f.group);
    await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      otherClosed.cierre!,
      { codigo: 'F' },
    ).expect(409);
    await correct(f.sessions[0]!, other.enrollment, null, closed.cierre!, {
      codigo: 'F',
    }).expect(400);
    for (const session of [cancelled, future])
      await correct(session, f.enrollment, null, closed.cierre!, {
        codigo: 'P',
      }).expect(409);
    await call(
      'patch',
      `${attendancePath(other.sessions[0]!).replace(other.group.id, f.group.id)}/correccion`,
    )
      .send(
        correctionBody(f.enrollment, f.marks[0]!, closed.cierre!, {
          codigo: 'F',
        }),
      )
      .expect(404);
    expect(await persisted(f.group)).toEqual(before);
  });

  it('dos correcciones concurrentes de la misma versión guardan una sola modificación', async () => {
    const f = await dataset(['F']);
    const closed = (await close(f.group)).body as ClosureView;
    const responses = await Promise.all(
      ['P', 'T'].map((codigo) =>
        correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
          codigo,
        }),
      ),
    );
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const current = await history(f.sessions[0]!, f.enrollment);
    expect(current.asistencia!.version).toBe(2);
    expect(current.items).toHaveLength(1);
    await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
      codigo: 'F',
    }).expect(409);
  });

  it('una corrección sin cambios no incrementa versión, no crea evento ni modifica cierre', async () => {
    const f = await dataset();
    const closed = (await close(f.group)).body as ClosureView;
    const before = await persisted(f.group);
    const response = await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      closed.cierre!,
    ).expect(200);
    expect(response.body.items[0].version).toBe(1);
    expect(await persisted(f.group)).toEqual(before);
    expect((await history(f.sessions[0]!, f.enrollment)).items).toHaveLength(0);
  });

  it('J con expediente conserva su marca y decisiones; ADMIN solo corrige observación', async () => {
    const f = await dataset(['J']);
    await justification(f.group, f.marks[0]!, true);
    const closed = (await close(f.group, true)).body as ClosureView;
    const before = await persisted(f.group);
    for (const codigo of ['P', 'F', 'T'])
      await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
        codigo,
      }).expect(409);
    expect(await persisted(f.group)).toEqual(before);
    await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
      observacion: 'Aclaración administrativa conservando expediente',
    }).expect(200);
    const after = await persisted(f.group);
    expect(after.justifications).toEqual(before.justifications);
    expect(after.attendance[0]).toMatchObject({ codigo: 'J', version: 2 });
    expect(
      (await matrix(f.sessions[0]!)).items[0]!.resumenAsistencia,
    ).toMatchObject({
      cierreConfirmado: true,
      justificadasPendientes: 1,
      faltasConfirmadas: 1,
    });
  });

  it('un fallo de auditoría revierte cierre completo y permite reintentar la misma revisión', async () => {
    const f = await dataset();
    const reviewed = await view(f.group);
    const before = await persisted(f.group);
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
      new Error('Fallo sintético de auditoría B15'),
    );
    await call('post', closurePath(f.group))
      .send({ revision: reviewed.revision, confirmarPendientes: false })
      .expect(500);
    expect(await persisted(f.group)).toEqual(before);
    expect((await view(f.group)).revision).toBe(reviewed.revision);
    await call('post', closurePath(f.group))
      .send({ revision: reviewed.revision, confirmarPendientes: false })
      .expect(201);
  });

  it.each(['auditoría', 'cálculo'])(
    'un fallo de %s después de corregir revierte marca, evidencia y cálculo',
    async (failure) => {
      const f = await dataset(['F']);
      const closed = (await close(f.group)).body as ClosureView;
      const before = await persisted(f.group);
      if (failure === 'auditoría')
        vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
          new Error('Fallo sintético de auditoría de corrección'),
        );
      else {
        const calculation = app.get(AttendanceCalculationService);
        const original = calculation.summaries.bind(calculation);
        vi.spyOn(calculation, 'summaries').mockImplementation(
          async (manager, ids) => {
            const [row] = await manager.query(
              'SELECT version FROM asistencias WHERE id=$1',
              [f.marks[0]!.id],
            );
            if (row.version === 2)
              throw new Error('Fallo sintético de cálculo posterior al cambio');
            return original(manager, ids);
          },
        );
      }
      await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
        codigo: 'P',
      }).expect(500);
      expect(await persisted(f.group)).toEqual(before);
      vi.restoreAllMocks();
      expect(
        (await matrix(f.sessions[0]!)).items[0]!.resumenAsistencia
          .inasistenciaPct,
      ).toBe('100.00');
      await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
        codigo: 'P',
      }).expect(200);
    },
  );

  it('revalida revocación de sesión y rol ADMIN dentro del comando', async () => {
    const f = await dataset();
    const closed = (await close(f.group)).body as ClosureView;
    const revoked = await login('admin_b15');
    await call('post', 'auth/logout', revoked).send({}).expect(204);
    await correct(
      f.sessions[0]!,
      f.enrollment,
      f.marks[0]!,
      closed.cierre!,
      { codigo: 'F' },
      revoked,
    ).expect(401);
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$1 FROM roles WHERE codigo='SECRETARIA'",
      [adminId],
    );
    await source.query(
      "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='ADMIN')",
      [adminId],
    );
    try {
      await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
        codigo: 'F',
      }).expect(403);
    } finally {
      await source.query(
        "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$1 FROM roles WHERE codigo='ADMIN'",
        [adminId],
      );
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='SECRETARIA')",
        [adminId],
      );
    }
    expect((await history(f.sessions[0]!, f.enrollment)).items).toHaveLength(0);
  });

  it('valida contratos, motivo no vacío, rangos y protección CSRF antes de mutar', async () => {
    const f = await dataset();
    const reviewed = await view(f.group);
    for (const patch of [
      { revision: undefined },
      { revision: 'x' },
      { confirmarPendientes: 'true' },
      { motivo: 'x'.repeat(401) },
      { extra: true },
    ])
      await call('post', closurePath(f.group))
        .send({
          revision: reviewed.revision,
          confirmarPendientes: false,
          ...patch,
        })
        .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/${closurePath(f.group)}`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .send({ revision: reviewed.revision, confirmarPendientes: false })
      .expect(403);
    const closed = (await close(f.group)).body as ClosureView;
    const before = await persisted(f.group);
    for (const patch of [
      { motivo: undefined },
      { motivo: '   ' },
      { motivo: 'x'.repeat(401) },
      { codigo: 'X' },
      { version: 0 },
      { version: '1' },
      { cierreId: '-1' },
      { observacion: 'x'.repeat(251) },
      { extra: 1 },
    ])
      await correct(
        f.sessions[0]!,
        f.enrollment,
        f.marks[0]!,
        closed.cierre!,
        patch,
      ).expect(400);
    expect(await persisted(f.group)).toEqual(before);
  });

  it('conserva reglas por intento, resultado confirmado e historial de intentos anteriores', async () => {
    const old = await dataset(['F', 'P', 'P', 'P'], 'CERRADA');
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,1,25,'APROBADO',now())",
      [old.enrollment.id],
    );
    const before = await persisted(old.group);
    const [parameter] = await source.query(
      'INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por) SELECT max(version)+1,13,50,2,now(),$1 FROM parametros_academicos RETURNING id',
      [adminId],
    );
    const group = await fixture.group();
    const enrollment = await fixture.enroll(
      group,
      old.student,
      'ACTIVA',
      parameter.id as string,
    );
    const session = await fixture.session(group, 'REALIZADA');
    const attendance = await mark(session, enrollment, 'F');
    const closed = (await close(group)).body as ClosureView;
    expect(closed.items[0]!.resumenAsistencia.reglas).toMatchObject({
      parametroId: parameter.id,
      inasistenciaMaxPct: '50.00',
      tardanzasPorFalta: 2,
    });
    await correct(session, enrollment, attendance, closed.cierre!, {
      codigo: 'P',
    }).expect(200);
    expect(await persisted(old.group)).toEqual(before);
    const previous = (
      await call(
        'get',
        `estudiantes/${old.student.id}/historial/${old.enrollment.id}`,
      ).expect(200)
    ).body;
    expect(previous.resumenAsistencia).toMatchObject({
      cierreConfirmado: false,
      reglas: { inasistenciaMaxPct: '30.00', tardanzasPorFalta: 3 },
    });
    expect(previous.resultado).toMatchObject({
      inasistenciaPct: '25.00',
      condicion: 'APROBADO',
      confirmadoAt: expect.any(String),
    });
  });

  it('la BD bloquea cambios ordinarios y valida contexto de corrección local por grupo', async () => {
    const f = await dataset(['P', null]);
    const other = await dataset();
    const closed = (await close(f.group, true)).body as ClosureView;
    const otherClosed = (await close(other.group)).body as ClosureView;
    const before = await persisted(f.group);
    for (const query of [
      "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
      "UPDATE sesiones_clase SET estado='CANCELADA' WHERE id=$1",
    ])
      await expect(
        source.query(query, [
          query.includes('asistencias') ? f.marks[0]!.id : f.sessions[0]!.id,
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(mark(f.sessions[1]!, f.enrollment, 'P')).rejects.toMatchObject(
      { driverError: { code: '23514' } },
    );
    await expect(
      fixture.session(f.group, 'PROGRAMADA', await dateAgo(9)),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [otherClosed.cierre!.id],
      );
      await expect(
        runner.query(
          "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
          [f.marks[0]!.id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      await runner.rollbackTransaction();
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [closed.cierre!.id],
      );
      await runner.query(
        "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
        [f.marks[0]!.id],
      );
      await runner.rollbackTransaction();
      await runner.startTransaction();
      await expect(
        runner.query(
          "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
          [f.marks[0]!.id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await persisted(f.group)).toEqual(before);
  });

  it('el contexto SQL de corrección tampoco elimina la marca J ni el expediente', async () => {
    const f = await dataset(['J']);
    await justification(f.group, f.marks[0]!);
    const closed = (await close(f.group, true)).body as ClosureView;
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [closed.cierre!.id],
      );
      await expect(
        runner.query(
          "UPDATE asistencias SET codigo='P',version=version+1 WHERE id=$1",
          [f.marks[0]!.id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23001' } });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await persisted(f.group)).attendance[0]).toMatchObject({
      codigo: 'J',
      version: 1,
    });
    expect((await persisted(f.group)).justifications).toHaveLength(1);
  });

  it('mantiene congelado el denominador del día de cierre aunque hoy haya más sesiones realizadas', async () => {
    const f = await dataset(['P', 'F']);
    // Evento histórico sintético: la sesión de hoy es posterior al corte de ayer.
    await source.query(
      `INSERT INTO cierres_academicos(grupo_id,tipo,estado,realizado_por,realizado_at,revision,resumen)
      VALUES($1,'ASISTENCIA','CERRADO',$2,($3::date+time '12:00') AT TIME ZONE 'America/Lima',$4,$5::jsonb)`,
      [
        f.group.id,
        adminId,
        fixture.yesterday,
        '0'.repeat(64),
        JSON.stringify({
          fechaCorte: fixture.yesterday,
          advertencias: {},
          intentos: [],
        }),
      ],
    );
    const closed = await view(f.group);
    expect(closed.hoy).toBe(fixture.today);
    expect(closed.items[0]!.resumenAsistencia).toMatchObject({
      sesionesComputables: 1,
      faltas: 1,
      presentes: 0,
      cierreConfirmado: true,
      inasistenciaPct: '100.00',
      condicion: 'RETIRADO_INASISTENCIA',
    });
    expect(closed.advertencias).toMatchObject({
      sesionesComputables: 1,
      sesionesFuturas: 1,
    });
    const excluded = await matrix(f.sessions[0]!);
    expect(excluded.puedeCorregir).toBe(false);
    await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
      codigo: 'F',
    }).expect(409);
    const included = await matrix(f.sessions[1]!);
    expect(included.puedeCorregir).toBe(true);
    await correct(f.sessions[1]!, f.enrollment, f.marks[1]!, closed.cierre!, {
      codigo: 'P',
    }).expect(200);
    const after = await view(f.group);
    expect(after.items[0]!.resumenAsistencia).toMatchObject({
      sesionesComputables: 1,
      presentes: 1,
      inasistenciaPct: '0.00',
    });
    const attempt = (
      await call(
        'get',
        `estudiantes/${f.student.id}/historial/${f.enrollment.id}`,
      ).expect(200)
    ).body;
    expect(attempt.asistencias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: f.sessions[0]!.id, computable: false }),
        expect.objectContaining({ id: f.sessions[1]!.id, computable: true }),
      ]),
    );
  });

  it('corrige un intento histórico cerrado sin sustituir sus notas o resultado académico confirmado', async () => {
    const f = await dataset(['F', 'P'], 'CERRADA');
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,1,25,'APROBADO',now())",
      [f.enrollment.id],
    );
    const before = await persisted(f.group);
    const closed = (await close(f.group)).body as ClosureView;
    expect((await matrix(f.sessions[0]!)).items[0]!.corregible).toBe(true);
    await correct(f.sessions[0]!, f.enrollment, f.marks[0]!, closed.cierre!, {
      codigo: 'P',
    }).expect(200);
    const after = await persisted(f.group);
    expect(after.results).toEqual(before.results);
    expect(after.enrollments).toEqual(before.enrollments);
    expect((await view(f.group)).items[0]!.resumenAsistencia).toMatchObject({
      cierreConfirmado: true,
      inasistenciaPct: '0.00',
      condicion: 'DENTRO_LIMITE',
    });
  });

  it('la BD bloquea matrículas y expedientes aun con contexto SQL de corrección de asistencia', async () => {
    const f = await dataset(['J', 'J']);
    const pending = await justification(f.group, f.marks[0]!);
    const waitingStudent = await fixture.student();
    const waiting = await fixture.enroll(f.group, waitingStudent, 'PENDIENTE');
    const [voucher] = await source.query(
      "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe,estado,validado_por,validado_at) VALUES($1,$2,$3,80,'VALIDADO',$4,now()) RETURNING id",
      [waitingStudent.id, `SYN-B15-SQL-${waiting.id}`, fixture.today, adminId],
    );
    const newStudent = await fixture.student();
    const closed = (await close(f.group, true)).body as ClosureView;
    await expect(
      fixture.enroll(f.group, newStudent, 'PENDIENTE'),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      source.query(
        "UPDATE matriculas SET estado='ACTIVA',voucher_id=$2 WHERE id=$1",
        [waiting.id, voucher.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [closed.cierre!.id],
      );
      await expect(
        runner.query(
          "UPDATE justificaciones SET estado='APROBADA',version=version+1,resuelto_por=$2,resuelto_at=now(),observacion_resolucion='Resolución fuera del flujo' WHERE id=$1",
          [pending.id, adminId],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      await runner.rollbackTransaction();
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [closed.cierre!.id],
      );
      await expect(
        runner.query(
          'INSERT INTO justificaciones(asistencia_id,motivo,fecha_presentacion,registrado_por) VALUES($1,$2,$3,$4)',
          [f.marks[1]!.id, 'Solicitud SQL tras cierre', fixture.today, adminId],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      await runner.rollbackTransaction();
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [closed.cierre!.id],
      );
      await expect(
        runner.query(
          "UPDATE sesiones_clase SET estado='CANCELADA' WHERE id=$1",
          [f.sessions[0]!.id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('un snapshot SQL anterior al cierre no puede agregar sesiones omitiendo el nuevo evento', async () => {
    const f = await dataset();
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction('REPEATABLE READ');
      // Fija la vista anterior sin mantener un bloqueo SHARE que impediría cerrar.
      await runner.query('SELECT id FROM grupos WHERE id=$1', [f.group.id]);
      await close(f.group);
      await expect(
        runner.query(
          "INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,'PROGRAMADA',$3)",
          [f.group.id, await dateAgo(9), adminId],
        ),
      ).rejects.toMatchObject({ driverError: { code: '40001' } });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await persisted(f.group)).sessions).toHaveLength(1);
  });

  it('el cierre y su auditoría son inmutables y la reversión conserva esquema e historial', async () => {
    const f = await dataset();
    const closed = (await close(f.group)).body as ClosureView;
    const before = await persisted(f.group);
    const migrations = await source.query(
      'SELECT * FROM migraciones ORDER BY id',
    );
    for (const query of [
      "UPDATE cierres_academicos SET motivo='Sustitución' WHERE id=$1",
      'DELETE FROM cierres_academicos WHERE id=$1',
    ])
      await expect(
        source.query(query, [closed.cierre!.id]),
      ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      source.query('TRUNCATE cierres_academicos'),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      checkMigrationReversal(source, new CierresAsistencia1790208011000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(f.group)).toEqual(before);
    expect(await source.query('SELECT * FROM migraciones ORDER BY id')).toEqual(
      migrations,
    );
  });

  it('publica cierre, corrección y consulta de evidencia en OpenAPI sin habilitar reapertura', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const base = '/api/v1/asistencia/grupos/{grupoId}';
    expect(spec.paths[`${base}/cierre`].get).toBeDefined();
    expect(spec.paths[`${base}/cierre`].post).toBeDefined();
    expect(
      spec.paths[`${base}/sesiones/{sesionId}/asistencias/correccion`].patch,
    ).toBeDefined();
    expect(
      spec.paths[
        `${base}/sesiones/{sesionId}/asistencias/{matriculaId}/historial`
      ].get,
    ).toBeDefined();
    expect(
      spec.components.schemas.CloseAttendanceDto.properties.confirmarPendientes,
    ).toMatchObject({ type: 'boolean' });
    expect(spec.components.schemas.CorrectAttendanceDto.required).toEqual(
      expect.arrayContaining([
        'motivo',
        'cierreId',
        'matriculaId',
        'codigo',
        'version',
      ]),
    );
    expect(JSON.stringify(spec.paths)).toContain('puedeCorregir');
    expect(
      Object.keys(spec.paths).filter((route) => route.includes('reapertura')),
    ).toHaveLength(0);
  });
});
