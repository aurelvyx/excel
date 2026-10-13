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
import { Justificaciones1790208010000 } from '../src/database/migraciones/1790208010000-justificaciones.js';
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
  throw new Error('Ejecutar B14 con pnpm test:db');
const password = 'Sintetica-segura-B14';
type Login = { cookie: string; csrf: string };
type Code = 'P' | 'F' | 'T' | 'J';
type State =
  'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'RECUPERADA' | 'NO_RECUPERADA';
type Justification = {
  id: string;
  asistencia_id: string;
  estado: State;
  version: number;
  motivo: string;
  fecha_presentacion: string;
  registrado_por: string;
  registrado_at: string;
  registrado_nombre: string;
  resuelto_por: string | null;
  resuelto_at: string | null;
  resuelto_nombre: string | null;
  observacion_resolucion: string | null;
  recuperacion_confirmada_por: string | null;
  recuperacion_at: string | null;
  recuperacion_nombre: string | null;
  observacion_recuperacion: string | null;
};
type Row = {
  asistencia_id: string;
  asistencia_version: number;
  fecha_sesion: string;
  matricula_id: string;
  justificacion: Justification | null;
  puedeRegistrar: boolean;
  puedeResolver: boolean;
  puedeConfirmarRecuperacion: boolean;
  motivoSoloLectura: string | null;
  resumenAsistencia: AttendanceSummary;
  historial?: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
    estado_anterior: State | null;
    estado_nuevo: State;
  }[];
};
type Mark = { id: string; version: number; codigo: Code };

describe('B14 justificaciones HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let secretary: Login;
  let teacher: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  const previousOrigins = process.env.WEB_ORIGINS;

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_justifications_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_justifications_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b14', password);
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
    admin = await login('admin_b14');
    secretary = await login('secretaria');
    teacher = await login('docente');
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
  const path = (group: AttendanceFixtureGroup) =>
    `asistencia/grupos/${group.id}/justificaciones`;
  async function dateAgo(days: number) {
    return (
      await source.query('SELECT ($1::date-$2::int)::text AS fecha', [
        fixture.today,
        days,
      ])
    )[0].fecha as string;
  }
  async function mark(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    code: Code = 'J',
  ): Promise<Mark> {
    const [row] = await source.query(
      'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id,version,codigo',
      [
        session.grupo_id,
        session.id,
        enrollment.id,
        code,
        fixture.userIds.docente,
      ],
    );
    return row as Mark;
  }
  async function dataset(
    codes: readonly Code[] = ['J'],
    state: 'ACTIVA' | 'CERRADA' | 'ANULADA' | 'PENDIENTE' = 'ACTIVA',
    assigned = true,
    parameterId?: string,
  ) {
    const group = await fixture.group(assigned);
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student, state, parameterId);
    const sessions: AttendanceFixtureSession[] = [];
    const marks: Mark[] = [];
    for (const [index, code] of codes.entries()) {
      const session = await fixture.session(
        group,
        'REALIZADA',
        await dateAgo(index),
      );
      sessions.push(session);
      marks.push(await mark(session, enrollment, code));
    }
    return { group, student, enrollment, sessions, marks };
  }
  const createBody = (
    attendance: Mark,
    patch: Record<string, unknown> = {},
  ) => ({
    asistenciaId: attendance.id,
    asistenciaVersion: attendance.version,
    motivo: 'Motivo sintético B14',
    fechaPresentacion: fixture.today,
    ...patch,
  });
  const create = (
    group: AttendanceFixtureGroup,
    attendance: Mark,
    actor = secretary,
    patch: Record<string, unknown> = {},
  ) => call('post', path(group), actor).send(createBody(attendance, patch));
  const resolve = (
    group: AttendanceFixtureGroup,
    row: Row,
    state: 'APROBADA' | 'RECHAZADA' = 'APROBADA',
    actor = secretary,
    patch: Record<string, unknown> = {},
  ) =>
    call(
      'patch',
      `${path(group)}/${row.justificacion!.id}/resolucion`,
      actor,
    ).send({
      estado: state,
      version: row.justificacion!.version,
      observacion: `Resolución sintética ${state}`,
      ...patch,
    });
  const recover = (
    group: AttendanceFixtureGroup,
    row: Row,
    state: 'RECUPERADA' | 'NO_RECUPERADA' = 'RECUPERADA',
    actor = teacher,
    patch: Record<string, unknown> = {},
  ) =>
    call(
      'patch',
      `${path(group)}/${row.justificacion!.id}/recuperacion`,
      actor,
    ).send({
      estado: state,
      version: row.justificacion!.version,
      observacion: `Recuperación sintética ${state}`,
      ...patch,
    });
  const detail = async (
    group: AttendanceFixtureGroup,
    row: Row,
    actor = admin,
  ): Promise<Row> =>
    (
      await call(
        'get',
        `${path(group)}/${row.justificacion!.id}`,
        actor,
      ).expect(200)
    ).body as Row;
  async function list(
    group: AttendanceFixtureGroup,
    actor = admin,
    query = '',
  ) {
    return (
      await call(
        'get',
        `${path(group)}${query ? `?${query}` : ''}`,
        actor,
      ).expect(200)
    ).body as {
      items: Row[];
      nextCursor: string | null;
      hoy: string;
      grupo: { id: string };
    };
  }
  async function persisted(group: AttendanceFixtureGroup) {
    const [attendance, justifications, results, audit] = await Promise.all([
      source.query('SELECT * FROM asistencias WHERE grupo_id=$1 ORDER BY id', [
        group.id,
      ]),
      source.query(
        'SELECT j.* FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=$1 ORDER BY j.id',
        [group.id],
      ),
      source.query(
        'SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1 ORDER BY r.id',
        [group.id],
      ),
      source.query(
        "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='justificaciones'",
      ),
    ]);
    return { attendance, justifications, results, audit };
  }
  function saveMark(
    session: AttendanceFixtureSession,
    enrollment: AttendanceFixtureEnrollment,
    code: Code,
    version: number,
    observation?: string | null,
  ) {
    return call(
      'patch',
      `asistencia/grupos/${session.grupo_id}/sesiones/${session.id}/asistencias`,
      teacher,
    ).send({
      registros: [
        {
          matriculaId: enrollment.id,
          codigo: code,
          version,
          ...(observation === undefined ? {} : { observacion: observation }),
        },
      ],
    });
  }

  it('lista J sin expediente como registrable y mantiene pendiente su incidencia sin crear datos por GET', async () => {
    const f = await dataset(['J', 'P', 'F', 'T']);
    const before = await persisted(f.group);
    const response = await list(f.group, secretary);
    expect(response.grupo.id).toBe(f.group.id);
    expect(response.hoy).toBe(fixture.today);
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      asistencia_id: f.marks[0]!.id,
      asistencia_version: 1,
      fecha_sesion: fixture.today,
      matricula_id: f.enrollment.id,
      justificacion: null,
      puedeRegistrar: true,
      puedeResolver: false,
      puedeConfirmarRecuperacion: false,
      resumenAsistencia: {
        estado: 'PROVISIONAL',
        justificadasPendientes: 1,
        faltasComputables: 2,
        inasistenciaPct: '50.00',
        condicion: null,
      },
    });
    expect(await persisted(f.group)).toEqual(before);
  });

  it('registra, aprueba y recupera una J con responsables e historial sin alterar la marca original', async () => {
    const f = await dataset(['J', 'F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P']);
    const created = (
      await create(f.group, f.marks[0]!, secretary, {
        motivo: '  Motivo conservado  ',
      }).expect(201)
    ).body as Row;
    expect(created.justificacion).toMatchObject({
      asistencia_id: f.marks[0]!.id,
      estado: 'PENDIENTE',
      version: 1,
      motivo: 'Motivo conservado',
      fecha_presentacion: fixture.today,
      registrado_por: fixture.userIds.secretaria,
      registrado_at: expect.any(String),
      registrado_nombre: 'secretaria',
      resuelto_por: null,
      recuperacion_confirmada_por: null,
    });
    expect(created.resumenAsistencia).toMatchObject({
      estado: 'PROVISIONAL',
      faltasComputables: 4,
      faltasConfirmadas: 3,
      inasistenciaPct: '40.00',
      condicion: null,
    });
    const approved = (
      await resolve(f.group, created, 'APROBADA', admin).expect(200)
    ).body as Row;
    expect(approved.justificacion).toMatchObject({
      estado: 'APROBADA',
      version: 2,
      resuelto_por: adminId,
      resuelto_at: expect.any(String),
      resuelto_nombre: 'admin_b14',
      observacion_resolucion: 'Resolución sintética APROBADA',
      registrado_por: fixture.userIds.secretaria,
      registrado_at: created.justificacion!.registrado_at,
    });
    expect(approved.resumenAsistencia).toEqual(created.resumenAsistencia);
    const recovered = (
      await recover(
        f.group,
        approved,
        'RECUPERADA',
        await login('docente2'),
      ).expect(200)
    ).body as Row;
    expect(recovered.justificacion).toMatchObject({
      estado: 'RECUPERADA',
      version: 3,
      recuperacion_confirmada_por: fixture.userIds.docente2,
      recuperacion_at: expect.any(String),
      recuperacion_nombre: 'docente2',
      observacion_recuperacion: 'Recuperación sintética RECUPERADA',
      resuelto_por: adminId,
      resuelto_at: approved.justificacion!.resuelto_at,
      observacion_resolucion: approved.justificacion!.observacion_resolucion,
    });
    expect(recovered.resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      justificadasPendientes: 0,
      justificadasRecuperadas: 1,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
      cierreConfirmado: false,
    });
    const loaded = await detail(f.group, recovered);
    expect(loaded.historial).toMatchObject([
      {
        accion: 'CREATE',
        usuario_id: fixture.userIds.secretaria,
        nombre_usuario: 'secretaria',
        estado_anterior: null,
        estado_nuevo: 'PENDIENTE',
        ocurrido_at: expect.any(String),
      },
      {
        accion: 'APPROVE',
        usuario_id: adminId,
        nombre_usuario: 'admin_b14',
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'APROBADA',
        ocurrido_at: expect.any(String),
      },
      {
        accion: 'RECOVER',
        usuario_id: fixture.userIds.docente2,
        nombre_usuario: 'docente2',
        estado_anterior: 'APROBADA',
        estado_nuevo: 'RECUPERADA',
        ocurrido_at: expect.any(String),
      },
    ]);
    expect(loaded.resumenAsistencia).toEqual(recovered.resumenAsistencia);
    expect(
      (
        await source.query(
          'SELECT codigo,version FROM asistencias WHERE id=$1',
          [f.marks[0]!.id],
        )
      )[0],
    ).toMatchObject({ codigo: 'J', version: 1 });
    const matrix = (
      await call(
        'get',
        `asistencia/grupos/${f.group.id}/sesiones/${f.sessions[0]!.id}/asistencias`,
      ).expect(200)
    ).body;
    expect(matrix.items[0].resumenAsistencia).toEqual(
      recovered.resumenAsistencia,
    );
    const history = (
      await call(
        'get',
        `estudiantes/${f.student.id}/historial/${f.enrollment.id}`,
      ).expect(200)
    ).body;
    expect(history.resumenAsistencia).toEqual(recovered.resumenAsistencia);
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [f.enrollment.id],
      ),
    ).toEqual([]);
  });

  it.each(['RECHAZADA', 'NO_RECUPERADA'] as const)(
    '%s confirma la incidencia y conserva J, decisión y auditoría',
    async (state) => {
      const f = await dataset([
        'J',
        'F',
        'F',
        'F',
        'P',
        'P',
        'P',
        'P',
        'P',
        'P',
      ]);
      const created = (await create(f.group, f.marks[0]!).expect(201))
        .body as Row;
      const resolved = (
        await resolve(
          f.group,
          created,
          state === 'RECHAZADA' ? state : 'APROBADA',
        ).expect(200)
      ).body as Row;
      const terminal =
        state === 'RECHAZADA'
          ? resolved
          : ((
              await recover(f.group, resolved, state, admin, {
                observacion: null,
              }).expect(200)
            ).body as Row);
      expect(terminal.justificacion!.estado).toBe(state);
      if (state === 'NO_RECUPERADA')
        expect(terminal.justificacion!.observacion_recuperacion).toBeNull();
      expect(terminal.resumenAsistencia).toMatchObject({
        estado: 'CALCULADO',
        justificadasPendientes: 0,
        justificadasComputables: 1,
        faltasConfirmadas: 4,
        faltasComputables: 4,
        inasistenciaPct: '40.00',
        condicion: 'RETIRADO_INASISTENCIA',
      });
      expect((await detail(f.group, terminal)).historial!.at(-1)!.accion).toBe(
        state === 'RECHAZADA' ? 'REJECT' : 'NOT_RECOVERED',
      );
      expect(
        (
          await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
            f.marks[0]!.id,
          ])
        )[0].codigo,
      ).toBe('J');
      const before = await persisted(f.group);
      await resolve(f.group, terminal).expect(409);
      await recover(f.group, terminal).expect(409);
      expect(await persisted(f.group)).toEqual(before);
    },
  );

  it('rechaza recuperación antes de aprobación y toda transición desde RECUPERADA', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    await recover(f.group, created).expect(409);
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    await resolve(f.group, approved, 'RECHAZADA').expect(409);
    const recovered = (await recover(f.group, approved).expect(200))
      .body as Row;
    const before = await persisted(f.group);
    await resolve(f.group, recovered).expect(409);
    await recover(f.group, recovered, 'NO_RECUPERADA').expect(409);
    expect(await persisted(f.group)).toEqual(before);
  });

  it('coordina versiones de asistencia y de expediente y bloquea duplicados sin repetir auditoría', async () => {
    const f = await dataset();
    await saveMark(
      f.sessions[0]!,
      f.enrollment,
      'J',
      1,
      'Corrección de observación previa',
    ).expect(200);
    await create(f.group, f.marks[0]!).expect(409);
    const current = { ...f.marks[0]!, version: 2 };
    const created = (await create(f.group, current).expect(201)).body as Row;
    const before = await persisted(f.group);
    await create(f.group, current).expect(409);
    await resolve(f.group, created, 'APROBADA', secretary, {
      version: 2,
    }).expect(409);
    expect(await persisted(f.group)).toEqual(before);
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    await recover(f.group, approved, 'RECUPERADA', teacher, {
      version: 1,
    }).expect(409);
    expect((await detail(f.group, approved)).justificacion!.estado).toBe(
      'APROBADA',
    );
  });

  it('dos altas concurrentes crean un único expediente y un único evento', async () => {
    const f = await dataset();
    const responses = await Promise.all([
      create(f.group, f.marks[0]!),
      create(f.group, f.marks[0]!, admin),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const [row] = await source.query(
      'SELECT id FROM justificaciones WHERE asistencia_id=$1',
      [f.marks[0]!.id],
    );
    expect(
      await source.query(
        "SELECT id FROM auditoria_eventos WHERE entidad='justificaciones' AND entidad_id=$1",
        [row.id],
      ),
    ).toHaveLength(1);
  });

  it('dos resoluciones concurrentes aplican una decisión y rechazan la versión obsoleta', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const responses = await Promise.all([
      resolve(f.group, created, 'APROBADA'),
      resolve(f.group, created, 'RECHAZADA', admin),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const current = await detail(f.group, created);
    expect(['APROBADA', 'RECHAZADA']).toContain(current.justificacion!.estado);
    expect(current.justificacion!.version).toBe(2);
    expect(current.historial).toHaveLength(2);
  });

  it('dos recuperaciones concurrentes conservan solo una confirmación', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    const responses = await Promise.all([
      recover(f.group, approved),
      recover(f.group, approved, 'NO_RECUPERADA', admin),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const current = await detail(f.group, approved);
    expect(['RECUPERADA', 'NO_RECUPERADA']).toContain(
      current.justificacion!.estado,
    );
    expect(current.justificacion!.version).toBe(3);
    expect(current.historial).toHaveLength(3);
  });

  it.each(['secretaria', 'coordinador', 'docente'] as const)(
    'expone solo las acciones permitidas a %s',
    async (name) => {
      const f = await dataset();
      const actor = await login(name);
      const initial = (await list(f.group, actor)).items[0]!;
      expect(initial.puedeRegistrar).toBe(name === 'secretaria');
      if (name !== 'secretaria')
        await create(f.group, f.marks[0]!, actor).expect(403);
      const created = (await create(f.group, f.marks[0]!, admin).expect(201))
        .body as Row;
      const pending = (await list(f.group, actor)).items[0]!;
      expect(pending.puedeResolver).toBe(name === 'secretaria');
      expect(pending.puedeConfirmarRecuperacion).toBe(false);
      if (name !== 'secretaria')
        await resolve(f.group, created, 'APROBADA', actor).expect(403);
      const approved = (
        await resolve(f.group, created, 'APROBADA', admin).expect(200)
      ).body as Row;
      const ready = await detail(f.group, approved, actor);
      expect(ready.puedeConfirmarRecuperacion).toBe(name === 'docente');
      if (name !== 'docente')
        await recover(f.group, approved, 'RECUPERADA', actor).expect(403);
      else await recover(f.group, approved, 'RECUPERADA', actor).expect(200);
    },
  );

  it('un docente ajeno no consulta ni confirma recuperación y un id de otro grupo no se reutiliza', async () => {
    const f = await dataset();
    const other = await fixture.group(false);
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    const outsider = await login('ajeno');
    await call('get', path(f.group), outsider).expect(403);
    await call(
      'get',
      `${path(f.group)}/${approved.justificacion!.id}`,
      outsider,
    ).expect(403);
    await recover(f.group, approved, 'RECUPERADA', outsider).expect(403);
    await create(other, f.marks[0]!).expect(404);
    await call('get', `${path(other)}/${approved.justificacion!.id}`).expect(
      404,
    );
    await resolve(other, approved).expect(404);
    await recover(other, approved, 'RECUPERADA', admin).expect(404);
  });

  it.each(['SECRETARIA', 'ADMIN'] as const)(
    'combina DOCENTE con %s conservando el alcance de recuperación',
    async (role) => {
      const own = await dataset();
      const foreign = await dataset(['J'], 'ACTIVA', false);
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [fixture.userIds.docente, adminId, role],
      );
      try {
        const mixed = await login('docente');
        for (const f of [own, foreign]) {
          const created = (
            await create(f.group, f.marks[0]!, mixed).expect(201)
          ).body as Row;
          const approved = (
            await resolve(f.group, created, 'APROBADA', mixed).expect(200)
          ).body as Row;
          const readable = await detail(f.group, approved, mixed);
          const allowed = f === own || role === 'ADMIN';
          expect(readable.puedeConfirmarRecuperacion).toBe(allowed);
          await recover(f.group, approved, 'RECUPERADA', mixed).expect(
            allowed ? 200 : 403,
          );
        }
      } finally {
        await source.query(
          'DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo=$2)',
          [fixture.userIds.docente, role],
        );
      }
    },
  );

  it('revalida la asignación y el rol tras haber abierto el expediente', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    await detail(f.group, approved, teacher);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [f.group.id, fixture.teacherId],
    );
    await recover(f.group, approved).expect(403);
    await call('get', path(f.group), teacher).expect(403);
    await source.query(
      "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo='SECRETARIA')",
      [fixture.userIds.secretaria],
    );
    try {
      const second = await dataset();
      const before = await persisted(second.group);
      // Al perder su único rol activo, authenticate invalida también la sesión.
      const denied = await create(
        second.group,
        second.marks[0]!,
        secretary,
      ).expect(401);
      expect(denied.body.message).toBe('Sesión inválida o vencida');
      expect(await persisted(second.group)).toEqual(before);
    } finally {
      await source.query(
        "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
        [fixture.userIds.secretaria, adminId],
      );
    }
  });

  it.each(['docentes', 'personas'] as const)(
    'un perfil inactivo en %s pierde permiso de recuperación',
    async (table) => {
      const f = await dataset();
      const created = (await create(f.group, f.marks[0]!).expect(201))
        .body as Row;
      const approved = (await resolve(f.group, created).expect(200))
        .body as Row;
      const id =
        table === 'docentes' ? fixture.teacherId : fixture.teacherPersonId;
      await source.query(`UPDATE ${table} SET activo=false WHERE id=$1`, [id]);
      try {
        await recover(f.group, approved).expect(403);
      } finally {
        await source.query(`UPDATE ${table} SET activo=true WHERE id=$1`, [id]);
      }
    },
  );

  it.each(['grupo', 'periodo'] as const)(
    'un %s cerrado bloquea todas las mutaciones ordinarias incluso administrativas',
    async (target) => {
      const f = await dataset(['J', 'J', 'J']);
      const pending = (await create(f.group, f.marks[1]!).expect(201))
        .body as Row;
      const created = (await create(f.group, f.marks[2]!).expect(201))
        .body as Row;
      const approved = (await resolve(f.group, created).expect(200))
        .body as Row;
      if (target === 'grupo')
        await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
          f.group.id,
        ]);
      else
        await source.query(
          "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
          [f.group.periodo_id],
        );
      const before = await persisted(f.group);
      const read = await list(f.group);
      expect(
        read.items.every(
          (row) =>
            !row.puedeRegistrar &&
            !row.puedeResolver &&
            !row.puedeConfirmarRecuperacion &&
            row.motivoSoloLectura,
        ),
      ).toBe(true);
      for (const actor of [admin, secretary]) {
        await create(f.group, f.marks[0]!, actor).expect(409);
        await resolve(f.group, pending, 'APROBADA', actor).expect(409);
      }
      for (const actor of [admin, teacher])
        await recover(f.group, approved, 'RECUPERADA', actor).expect(409);
      expect(await persisted(f.group)).toEqual(before);
    },
  );

  it.each(['CERRADA', 'ANULADA', 'PENDIENTE'] as const)(
    'conserva consulta pero impide registrar sobre una matrícula %s',
    async (state) => {
      const f = await dataset(['J'], state);
      const response = await list(f.group, secretary);
      expect(response.items[0]!.puedeRegistrar).toBe(false);
      await create(f.group, f.marks[0]!).expect(409);
    },
  );

  it.each(['P', 'F', 'T'] as const)(
    'no convierte una marca %s en J para registrar una solicitud',
    async (code) => {
      const f = await dataset([code]);
      await create(f.group, f.marks[0]!).expect(400);
      expect((await list(f.group)).items).toEqual([]);
      expect(
        (
          await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
            f.marks[0]!.id,
          ])
        )[0].codigo,
      ).toBe(code);
    },
  );

  it.each(['PROGRAMADA', 'CANCELADA', 'FUTURA'] as const)(
    'no registra en una sesión %s',
    async (state) => {
      const group = await fixture.group();
      const enrollment = await fixture.enroll(group, await fixture.student());
      const session = await fixture.session(
        group,
        state === 'FUTURA' ? 'REALIZADA' : state,
        state === 'FUTURA' ? fixture.tomorrow : fixture.today,
      );
      const attendance = await mark(session, enrollment);
      await create(group, attendance).expect(409);
      expect((await list(group)).items[0]!.puedeRegistrar).toBe(false);
    },
  );

  it('valida el rango civil de presentación sin exigir una ventana institucional adicional', async () => {
    const f = await dataset();
    await create(f.group, f.marks[0]!, secretary, {
      fechaPresentacion: fixture.yesterday,
    }).expect(400);
    await create(f.group, f.marks[0]!, secretary, {
      fechaPresentacion: fixture.tomorrow,
    }).expect(400);
    await create(f.group, f.marks[0]!, secretary, {
      fechaPresentacion: fixture.today,
    }).expect(201);
    const historical = await dataset(['P', 'J']);
    await create(historical.group, historical.marks[1]!, secretary, {
      fechaPresentacion: fixture.yesterday,
    }).expect(201);
  });

  it('rechaza DTO de alta inválidos, null, identificadores no textuales y propiedades adicionales', async () => {
    const f = await dataset();
    for (const patch of [
      { asistenciaId: null },
      { asistenciaId: 1 },
      { asistenciaId: '0' },
      { asistenciaVersion: undefined },
      { asistenciaVersion: null },
      { asistenciaVersion: '1' },
      { asistenciaVersion: 0 },
      { motivo: null },
      { motivo: '' },
      { motivo: '   ' },
      { motivo: 'a'.repeat(501) },
      { fechaPresentacion: null },
      { fechaPresentacion: '2026-02-30' },
      { fechaPresentacion: `${fixture.today}T12:00:00Z` },
      { estado: 'RECUPERADA' },
    ])
      await create(f.group, f.marks[0]!, secretary, patch).expect(400);
    expect((await persisted(f.group)).justifications).toEqual([]);
  });

  it('rechaza versiones y decisiones inválidas y requiere observación de resolución', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    for (const patch of [
      { version: undefined },
      { version: null },
      { version: '1' },
      { version: 0 },
      { version: 1.1 },
      { estado: 'RECUPERADA' },
      { estado: null },
      { observacion: undefined },
      { observacion: null },
      { observacion: '' },
      { observacion: '  ' },
      { observacion: 'a'.repeat(301) },
      { motivo: 'extra' },
    ])
      await resolve(f.group, created, 'APROBADA', secretary, patch).expect(400);
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    for (const patch of [
      { version: null },
      { version: undefined },
      { version: '2' },
      { version: 0 },
      { estado: 'APROBADA' },
      { observacion: 'a'.repeat(301) },
      { observacion: 3 },
      { extra: true },
    ])
      await recover(f.group, approved, 'RECUPERADA', teacher, patch).expect(
        400,
      );
    const recovered = (
      await recover(f.group, approved, 'RECUPERADA', teacher, {
        observacion: undefined,
      }).expect(200)
    ).body as Row;
    expect(recovered.justificacion!.observacion_recuperacion).toBeNull();
  });

  it('protege CSRF y vuelve a comprobar la sesión en cada mutación', async () => {
    const f = await dataset();
    await request(app.getHttpServer())
      .post(`/api/v1/${path(f.group)}`)
      .set('Cookie', secretary.cookie)
      .send(createBody(f.marks[0]!))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/${path(f.group)}`)
      .expect(401);
    const actor = await login('secretaria');
    await source.query(
      'UPDATE sesiones_usuario SET revocado_at=now() WHERE usuario_id=$1 AND revocado_at IS NULL',
      [fixture.userIds.secretaria],
    );
    await create(f.group, f.marks[0]!, actor).expect(401);
  });

  it.each(['alta', 'resolución', 'recuperación'] as const)(
    'un fallo de auditoría en %s revierte expediente, marca y cálculo',
    async (stage) => {
      const f = await dataset(['J', 'P', 'P']);
      let row: Row | undefined;
      if (stage !== 'alta')
        row = (await create(f.group, f.marks[0]!).expect(201)).body as Row;
      if (stage === 'recuperación')
        row = (await resolve(f.group, row!).expect(200)).body as Row;
      const before = await persisted(f.group);
      const previous = (await list(f.group)).items[0]!.resumenAsistencia;
      const audit = app.get(AuditService);
      const original = audit.record.bind(audit);
      vi.spyOn(audit, 'record').mockImplementation(async (...args) => {
        if (args[0].entidad === 'justificaciones')
          throw new Error('Fallo sintético de auditoría B14');
        return original(...args);
      });
      const response = await (
        stage === 'alta'
          ? create(f.group, f.marks[0]!)
          : stage === 'resolución'
            ? resolve(f.group, row!)
            : recover(f.group, row!)
      ).expect(500);
      expect(response.body.message).toBe('Error interno del servidor');
      expect(await persisted(f.group)).toEqual(before);
      expect((await list(f.group)).items[0]!.resumenAsistencia).toEqual(
        previous,
      );
    },
  );

  it('un fallo del resumen después de escribir revierte la transición y su evento', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const before = await persisted(f.group);
    vi.spyOn(
      app.get(AttendanceCalculationService),
      'summaries',
    ).mockRejectedValueOnce(new Error('Fallo sintético de proyección B14'));
    await resolve(f.group, created).expect(500);
    expect(await persisted(f.group)).toEqual(before);
    expect((await detail(f.group, created)).justificacion!.estado).toBe(
      'PENDIENTE',
    );
  });

  it('el expediente impide sustituir J y permite corregir solo su observación', async () => {
    const f = await dataset();
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    const before = await persisted(f.group);
    for (const code of ['P', 'F', 'T'] as const)
      await saveMark(f.sessions[0]!, f.enrollment, code, 1).expect(409);
    expect(await persisted(f.group)).toEqual(before);
    await saveMark(
      f.sessions[0]!,
      f.enrollment,
      'J',
      1,
      'Observación corregida sin borrar evidencia',
    ).expect(200);
    const current = await detail(f.group, created);
    expect(current.asistencia_version).toBe(2);
    expect(current.justificacion).toEqual(created.justificacion);
    expect(current.historial).toHaveLength(1);
  });

  it('pagina por asistencia y filtra los seis estados sin duplicar ni ocultar expedientes', async () => {
    const group = await fixture.group();
    const session = await fixture.session(group, 'REALIZADA');
    const states = [
      'SIN_SOLICITUD',
      'PENDIENTE',
      'APROBADA',
      'RECHAZADA',
      'RECUPERADA',
      'NO_RECUPERADA',
    ] as const;
    const expected = new Map<string, string>();
    let firstDocument = '';
    for (const state of states) {
      const student = await fixture.student();
      if (!firstDocument) firstDocument = student.documento;
      const enrollment = await fixture.enroll(group, student);
      const attendance = await mark(session, enrollment);
      expected.set(state, attendance.id);
      if (state === 'SIN_SOLICITUD') continue;
      let row = (await create(group, attendance).expect(201)).body as Row;
      if (state !== 'PENDIENTE')
        row = (
          await resolve(
            group,
            row,
            state === 'RECHAZADA' ? state : 'APROBADA',
          ).expect(200)
        ).body as Row;
      if (state === 'RECUPERADA' || state === 'NO_RECUPERADA')
        await recover(group, row, state).expect(200);
    }
    const ids: string[] = [];
    let after = '';
    do {
      const page = await list(
        group,
        secretary,
        `limit=2${after ? `&after=${after}` : ''}`,
      );
      ids.push(...page.items.map((row) => row.asistencia_id));
      after = page.nextCursor ?? '';
    } while (after);
    expect(ids).toEqual([...expected.values()]);
    expect(new Set(ids).size).toBe(6);
    for (const state of states)
      expect(
        (await list(group, secretary, `estado=${state}`)).items.map(
          (row) => row.asistencia_id,
        ),
      ).toEqual([expected.get(state)]);
    expect(
      (
        await list(group, secretary, `q=${encodeURIComponent(firstDocument)}`)
      ).items.map((row) => row.asistencia_id),
    ).toEqual([expected.get('SIN_SOLICITUD')]);
    for (const query of [
      'estado=INVALIDO',
      'limit=0',
      'after=-1',
      'extra=1',
      'estado=PENDIENTE&estado=APROBADA',
      'q=x&q=y',
    ])
      await call('get', `${path(group)}?${query}`, secretary).expect(400);
  });

  it('separa intentos del mismo nivel y conserva reglas versionadas y resultados académicos previos', async () => {
    const [parameter] = await source.query(
      `INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
       SELECT max(version)+1,13,50,2,now(),$1 FROM parametros_academicos RETURNING id`,
      [adminId],
    );
    const old = await dataset(['J', 'F', 'P', 'P'], 'CERRADA');
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,1,25,'APROBADO',now())",
      [old.enrollment.id],
    );
    const group = await fixture.group();
    const enrollment = await fixture.enroll(
      group,
      old.student,
      'ACTIVA',
      parameter.id as string,
    );
    const session = await fixture.session(group, 'REALIZADA');
    const attendance = await mark(session, enrollment);
    const before = await persisted(old.group);
    const created = (await create(group, attendance).expect(201)).body as Row;
    const approved = (await resolve(group, created).expect(200)).body as Row;
    const recovered = (await recover(group, approved).expect(200)).body as Row;
    expect(recovered.resumenAsistencia.reglas).toMatchObject({
      parametroId: parameter.id,
      inasistenciaMaxPct: '50.00',
      tardanzasPorFalta: 2,
    });
    expect(recovered.resumenAsistencia.inasistenciaPct).toBe('0.00');
    const after = await persisted(old.group);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.justifications).toEqual(before.justifications);
    expect(after.results).toEqual(before.results);
    const history = (
      await call(
        'get',
        `estudiantes/${old.student.id}/historial/${old.enrollment.id}`,
      ).expect(200)
    ).body;
    expect(history.resumenAsistencia).toMatchObject({
      justificadasPendientes: 1,
      inasistenciaPct: '50.00',
      condicion: null,
      reglas: { inasistenciaMaxPct: '30.00', tardanzasPorFalta: 3 },
    });
    expect(history.resultado).toMatchObject({
      inasistenciaPct: '25.00',
      condicion: 'APROBADO',
      confirmadoAt: expect.any(String),
    });
  });

  it('la BD protege J única, origen, versiones, transiciones y conservación del historial', async () => {
    const f = await dataset(['J', 'F']);
    const created = (await create(f.group, f.marks[0]!).expect(201))
      .body as Row;
    await expect(
      source.query(
        'INSERT INTO justificaciones(asistencia_id,motivo,fecha_presentacion,registrado_por) VALUES($1,$2,$3,$4)',
        [f.marks[0]!.id, 'Duplicado sintético', fixture.today, adminId],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(
      source.query(
        'INSERT INTO justificaciones(asistencia_id,motivo,fecha_presentacion,registrado_por) VALUES($1,$2,$3,$4)',
        [f.marks[1]!.id, 'Marca incorrecta', fixture.today, adminId],
      ),
    ).rejects.toBeDefined();
    for (const query of [
      "UPDATE justificaciones SET motivo='Cambio de origen' WHERE id=$1",
      'UPDATE justificaciones SET registrado_por=NULL WHERE id=$1',
      'UPDATE justificaciones SET version=0 WHERE id=$1',
      "UPDATE justificaciones SET estado='RECUPERADA',version=version+1 WHERE id=$1",
      'DELETE FROM justificaciones WHERE id=$1',
    ])
      await expect(
        source.query(query, [created.justificacion!.id]),
      ).rejects.toBeDefined();
    await expect(
      source.query(
        "UPDATE justificaciones SET estado='APROBADA',version=version+1,resuelto_por=$2,resuelto_at=now(),observacion_resolucion=NULL WHERE id=$1",
        [created.justificacion!.id, adminId],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      source.query("UPDATE asistencias SET codigo='P' WHERE id=$1", [
        f.marks[0]!.id,
      ]),
    ).rejects.toBeDefined();
    const approved = (await resolve(f.group, created).expect(200)).body as Row;
    await expect(
      source.query(
        "UPDATE justificaciones SET observacion_resolucion='Sustitución',estado='RECUPERADA',version=version+1,recuperacion_confirmada_por=$2,recuperacion_at=now() WHERE id=$1",
        [approved.justificacion!.id, adminId],
      ),
    ).rejects.toBeDefined();
    const recovered = (await recover(f.group, approved).expect(200))
      .body as Row;
    await expect(
      source.query(
        "UPDATE justificaciones SET estado='NO_RECUPERADA',version=version+1 WHERE id=$1",
        [recovered.justificacion!.id],
      ),
    ).rejects.toBeDefined();
    expect((await detail(f.group, recovered)).historial).toHaveLength(3);
  });

  it('la migración no se revierte con expedientes persistidos y conserva esquema e historial', async () => {
    const f = await dataset();
    await create(f.group, f.marks[0]!).expect(201);
    const before = await persisted(f.group);
    const migrations = await source.query(
      'SELECT * FROM migraciones ORDER BY id',
    );
    await expect(
      checkMigrationReversal(source, new Justificaciones1790208010000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(f.group)).toEqual(before);
    expect(await source.query('SELECT * FROM migraciones ORDER BY id')).toEqual(
      migrations,
    );
  });

  it('la FK conserva J incluso ante inserción de expediente y corrección concurrentes fuera de HTTP', async () => {
    const f = await dataset();
    const registering = source.createQueryRunner();
    const correcting = source.createQueryRunner();
    try {
      await registering.startTransaction();
      await correcting.startTransaction();
      await registering.query(
        'INSERT INTO justificaciones(asistencia_id,motivo,fecha_presentacion,registrado_por) VALUES($1,$2,$3,$4)',
        [
          f.marks[0]!.id,
          'Concurrencia sintética de integridad',
          fixture.today,
          adminId,
        ],
      );
      const correction = correcting
        .query("UPDATE asistencias SET codigo='F' WHERE id=$1", [
          f.marks[0]!.id,
        ])
        .then(
          () => null,
          (error: unknown) => error,
        );
      await registering.commitTransaction();
      const error = await correction;
      expect(error).not.toBeNull();
      expect(['23001', '23503']).toContain(
        (error as { driverError: { code: string } }).driverError.code,
      );
    } finally {
      if (registering.isTransactionActive)
        await registering.rollbackTransaction();
      if (correcting.isTransactionActive)
        await correcting.rollbackTransaction();
      await registering.release();
      await correcting.release();
    }
    expect(
      (
        await source.query('SELECT codigo FROM asistencias WHERE id=$1', [
          f.marks[0]!.id,
        ])
      )[0].codigo,
    ).toBe('J');
    expect(
      await source.query(
        'SELECT id FROM justificaciones WHERE asistencia_id=$1',
        [f.marks[0]!.id],
      ),
    ).toHaveLength(1);
  });

  it('publica filtros, versiones, acciones e historial en OpenAPI', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const base =
      spec.paths['/api/v1/asistencia/grupos/{grupoId}/justificaciones'];
    const paths = Object.entries(spec.paths).filter(([route]) =>
      route.includes('/justificaciones'),
    );
    expect(paths).toHaveLength(4);
    expect(base.get).toBeDefined();
    expect(base.post).toBeDefined();
    expect(
      spec.components.schemas.CreateJustificationDto.properties
        .asistenciaVersion,
    ).toMatchObject({ type: 'number', minimum: 1 });
    expect(JSON.stringify(paths)).toContain('SIN_SOLICITUD');
    expect(JSON.stringify(paths)).toContain('resumenAsistencia');
    expect(JSON.stringify(paths)).toContain('historial');
    expect(JSON.stringify(paths)).toContain('NO_RECUPERADA');
  });
});
