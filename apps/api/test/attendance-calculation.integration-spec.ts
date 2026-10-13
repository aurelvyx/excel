import { DataSource } from 'typeorm';
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
  type AttendanceFixtureGroup,
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureSession,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B13 con pnpm test:db');
const password = 'Sintetica-segura-B13';
type Login = { cookie: string; csrf: string };
type Code = 'P' | 'F' | 'T' | 'J';
type Summary = {
  estado: string;
  sesionesComputables: number;
  presentes: number;
  faltas: number;
  tardanzas: number;
  justificadas: number;
  marcasPendientes: number;
  faltasPorTardanzas: number;
  tardanzasRestantes: number;
  justificadasPendientes: number;
  justificadasRecuperadas: number;
  justificadasComputables: number;
  faltasConfirmadas: number;
  faltasComputables: number;
  inasistenciaPct: string | null;
  excedeLimite: boolean | null;
  condicion: string | null;
  cierreConfirmado: boolean;
  criterioSesiones: string;
  reglas: {
    parametroId: string;
    version: number;
    inasistenciaMaxPct: string;
    tardanzasPorFalta: number;
  };
};
type MatrixRow = {
  matricula_id: string;
  resumenAsistencia: Summary;
};

describe('B13 cálculo de asistencia HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let writer: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  const previousOrigins = process.env.WEB_ORIGINS;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_attendance_calculation_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_attendance_calculation_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b13', password);
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
    admin = await login('admin_b13');
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
  async function login(name: string): Promise<Login> {
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
    route: string,
    user = method === 'patch' ? writer : admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/${route}`)
      .set('Origin', origin)
      .set('Cookie', user.cookie)
      .set('X-CSRF-Token', user.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const path = (s: AttendanceFixtureSession) =>
    `asistencia/grupos/${s.grupo_id}/sesiones/${s.id}/asistencias`;
  const entry = (
    m: AttendanceFixtureEnrollment,
    codigo: Code,
    version: number | null = null,
  ) => ({ matriculaId: m.id, codigo, version });
  const save = (
    s: AttendanceFixtureSession,
    registros: ReturnType<typeof entry>[],
    user = writer,
  ) => call('patch', path(s), user).send({ registros });
  async function dateAgo(days: number) {
    return (
      await source.query('SELECT ($1::date-$2::int)::text AS fecha', [
        fixture.today,
        days,
      ])
    )[0].fecha as string;
  }
  async function mark(
    s: AttendanceFixtureSession,
    m: AttendanceFixtureEnrollment,
    code: Code,
  ) {
    // Preparación de datos sintéticos; las pruebas de guardado pasan por la API real.
    await source.query(
      'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5)',
      [s.grupo_id, s.id, m.id, code, fixture.userIds.docente],
    );
  }
  async function dataset(
    codes: (Code | null)[],
    state: 'ACTIVA' | 'CERRADA' = 'ACTIVA',
    parameterId?: string,
  ) {
    const group = await fixture.group();
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student, state, parameterId);
    const sessions: AttendanceFixtureSession[] = [];
    for (const [index, code] of codes.entries()) {
      const session = await fixture.session(
        group,
        'REALIZADA',
        await dateAgo(index),
      );
      sessions.push(session);
      if (code !== null) await mark(session, enrollment, code);
    }
    return { group, student, enrollment, sessions };
  }
  async function summary(
    s: AttendanceFixtureSession,
    m: AttendanceFixtureEnrollment,
    user = admin,
  ): Promise<Summary> {
    const response = (await call('get', path(s), user).expect(200)).body;
    return response.items.find((row: MatrixRow) => row.matricula_id === m.id)
      .resumenAsistencia;
  }
  async function history(studentId: string, enrollmentId: string) {
    return (
      await call(
        'get',
        `estudiantes/${studentId}/historial/${enrollmentId}`,
      ).expect(200)
    ).body;
  }
  async function persistedSnapshot(group: AttendanceFixtureGroup) {
    const [rows, results, audit] = await Promise.all([
      source.query('SELECT * FROM asistencias WHERE grupo_id=$1 ORDER BY id', [
        group.id,
      ]),
      source.query(
        'SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1 ORDER BY r.id',
        [group.id],
      ),
      source.query('SELECT count(*)::int AS n FROM auditoria_eventos'),
    ]);
    return { rows, results, audit };
  }

  it('permite 30 % exacto y comparte el mismo resumen en matriz, lista y detalle del intento', async () => {
    const f = await dataset(['F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);
    const before = await persistedSnapshot(f.group);
    const calculated = await summary(f.sessions[0]!, f.enrollment);
    expect(calculated).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 10,
      presentes: 7,
      faltas: 3,
      tardanzas: 0,
      justificadas: 0,
      marcasPendientes: 0,
      faltasPorTardanzas: 0,
      tardanzasRestantes: 0,
      justificadasPendientes: 0,
      justificadasRecuperadas: 0,
      justificadasComputables: 0,
      faltasConfirmadas: 3,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
      cierreConfirmado: false,
      criterioSesiones: 'REALIZADAS_DEL_GRUPO_HASTA_HOY',
      reglas: { version: 1, inasistenciaMaxPct: '30.00', tardanzasPorFalta: 3 },
    });
    const list = (
      await call('get', `estudiantes/${f.student.id}/historial`).expect(200)
    ).body;
    expect(list.items[0].resumenAsistencia).toEqual(calculated);
    const detail = await history(f.student.id, f.enrollment.id);
    expect(detail.resumenAsistencia).toEqual(calculated);
    expect(detail.asistencias).toHaveLength(10);
    expect(
      detail.asistencias.every(
        (row: { computable: boolean }) => row.computable,
      ),
    ).toBe(true);
    expect(await persistedSnapshot(f.group)).toEqual(before);
  });

  it('superar 30 % señala retiro calculado sin crear resultados oficiales ni cambiar marcas', async () => {
    const f = await dataset(['F', 'F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P']);
    const before = await persistedSnapshot(f.group);
    expect(await summary(f.sessions[0]!, f.enrollment, writer)).toMatchObject({
      estado: 'CALCULADO',
      faltasComputables: 4,
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: 'RETIRADO_INASISTENCIA',
      cierreConfirmado: false,
    });
    expect((await history(f.student.id, f.enrollment.id)).resultado).toBeNull();
    expect(await persistedSnapshot(f.group)).toEqual(before);
  });

  it('convierte solo grupos completos de tardanzas y recalcula correcciones T y F sin reescribir otras marcas', async () => {
    const f = await dataset(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'F', 'P', 'P']);
    expect(await summary(f.sessions[0]!, f.enrollment)).toMatchObject({
      tardanzas: 7,
      faltas: 1,
      faltasPorTardanzas: 2,
      tardanzasRestantes: 1,
      faltasConfirmadas: 3,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
    });
    const correctedT = (
      await save(f.sessions[0]!, [entry(f.enrollment, 'P', 1)]).expect(200)
    ).body;
    expect(correctedT.resumenes).toHaveLength(1);
    expect(correctedT.resumenes[0]).toMatchObject({
      matriculaId: f.enrollment.id,
      resumenAsistencia: {
        tardanzas: 6,
        tardanzasRestantes: 0,
        faltasPorTardanzas: 2,
        faltasComputables: 3,
      },
    });
    const correctedF = (
      await save(f.sessions[7]!, [entry(f.enrollment, 'P', 1)]).expect(200)
    ).body;
    expect(correctedF.resumenes[0].resumenAsistencia).toMatchObject({
      faltas: 0,
      faltasComputables: 2,
      inasistenciaPct: '20.00',
      condicion: 'DENTRO_LIMITE',
    });
    const rows = await source.query(
      'SELECT codigo,version FROM asistencias WHERE matricula_id=$1 ORDER BY sesion_id',
      [f.enrollment.id],
    );
    expect(rows.map((row: { codigo: Code }) => row.codigo)).toEqual([
      'P',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'P',
      'P',
      'P',
    ]);
    expect(
      rows.filter((row: { version: number }) => row.version === 2),
    ).toHaveLength(2);
  });

  it('J pendiente cuenta provisionalmente y no confirma retiro; J→P elimina su incidencia y pendiente', async () => {
    const f = await dataset(['J', 'J', 'F', 'F', 'F', 'P', 'P', 'P', 'P', 'P']);
    expect(await summary(f.sessions[0]!, f.enrollment)).toMatchObject({
      estado: 'PROVISIONAL',
      justificadas: 2,
      justificadasPendientes: 2,
      justificadasRecuperadas: 0,
      justificadasComputables: 2,
      faltasConfirmadas: 3,
      faltasComputables: 5,
      inasistenciaPct: '50.00',
      excedeLimite: true,
      condicion: null,
    });
    const first = (
      await save(f.sessions[0]!, [entry(f.enrollment, 'P', 1)]).expect(200)
    ).body;
    expect(first.resumenes[0].resumenAsistencia).toMatchObject({
      estado: 'PROVISIONAL',
      justificadasPendientes: 1,
      faltasComputables: 4,
      condicion: null,
    });
    const second = (
      await save(f.sessions[1]!, [entry(f.enrollment, 'P', 1)]).expect(200)
    ).body;
    expect(second.resumenes[0].resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      justificadasPendientes: 0,
      justificadas: 0,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      condicion: 'DENTRO_LIMITE',
      cierreConfirmado: false,
    });
  });

  it('una marca pendiente conserva el denominador pero no se transforma en falta ni determina condición', async () => {
    const f = await dataset([
      'F',
      'F',
      'F',
      'F',
      'P',
      'P',
      'P',
      'P',
      'P',
      null,
    ]);
    expect(await summary(f.sessions[0]!, f.enrollment)).toMatchObject({
      estado: 'INCOMPLETO',
      sesionesComputables: 10,
      marcasPendientes: 1,
      faltas: 4,
      faltasComputables: 4,
      inasistenciaPct: '40.00',
      excedeLimite: true,
      condicion: null,
    });
    expect(
      await source.query('SELECT id FROM asistencias WHERE sesion_id=$1', [
        f.sessions[9]!.id,
      ]),
    ).toEqual([]);
    const saved = (
      await save(f.sessions[9]!, [entry(f.enrollment, 'P')]).expect(200)
    ).body;
    expect(saved.resumenes[0].resumenAsistencia).toMatchObject({
      estado: 'CALCULADO',
      marcasPendientes: 0,
      faltas: 4,
      condicion: 'RETIRADO_INASISTENCIA',
    });
  });

  it('usa sesiones realizadas hasta hoy del grupo completo y excluye canceladas, programadas y futuras', async () => {
    const f = await dataset(['F', 'T']);
    const programmed = await fixture.session(
      f.group,
      'PROGRAMADA',
      await dateAgo(2),
    );
    const cancelled = await fixture.session(
      f.group,
      'CANCELADA',
      await dateAgo(3),
    );
    const future = await fixture.session(
      f.group,
      'REALIZADA',
      fixture.tomorrow,
    );
    for (const s of [programmed, cancelled, future])
      await mark(s, f.enrollment, 'F');
    const calculated = await summary(f.sessions[0]!, f.enrollment);
    expect(calculated).toMatchObject({
      estado: 'CALCULADO',
      sesionesComputables: 2,
      faltas: 1,
      tardanzas: 1,
      tardanzasRestantes: 1,
      faltasComputables: 1,
      inasistenciaPct: '50.00',
    });
    const detail = await history(f.student.id, f.enrollment.id);
    expect(detail.asistencias).toHaveLength(5);
    for (const row of detail.asistencias as {
      id: string;
      computable: boolean;
    }[])
      expect(row.computable).toBe(f.sessions.some((s) => s.id === row.id));
    expect(detail.resumenAsistencia).toEqual(calculated);
    // fecha_matricula es ayer: la sesión anterior a esa fecha cuenta igualmente para el nivel completo.
    const fullLevel = await dataset(['P', 'P', 'F']);
    expect(
      await summary(fullLevel.sessions[0]!, fullLevel.enrollment),
    ).toMatchObject({
      sesionesComputables: 3,
      faltas: 1,
      inasistenciaPct: '33.33',
    });
  });

  it('sin sesiones computables no divide entre cero ni convierte solicitudes impagas en retirados', async () => {
    const group = await fixture.group();
    const s = await fixture.session(group, 'PROGRAMADA');
    const active = await fixture.enroll(group, await fixture.student());
    const pendingOwner = await fixture.student();
    const pending = await fixture.enroll(group, pendingOwner, 'PENDIENTE');
    const annulledOwner = await fixture.student();
    const annulled = await fixture.enroll(group, annulledOwner, 'ANULADA');
    expect(await summary(s, active)).toMatchObject({
      estado: 'SIN_SESIONES',
      sesionesComputables: 0,
      faltasComputables: 0,
      inasistenciaPct: null,
      excedeLimite: null,
      condicion: null,
      cierreConfirmado: false,
    });
    for (const [owner, enrollment] of [
      [pendingOwner, pending],
      [annulledOwner, annulled],
    ] as const) {
      const detail = await history(owner.id, enrollment.id);
      expect(detail.resumenAsistencia).toMatchObject({
        estado: 'NO_APLICA',
        inasistenciaPct: null,
        excedeLimite: null,
        condicion: null,
      });
      expect(detail.resultado).toBeNull();
    }
  });

  it('cada intento usa sus reglas inmutables aunque haya una versión posterior con otros parámetros', async () => {
    const group = await fixture.group();
    const owner = await fixture.student();
    const old = await fixture.enroll(group, owner, 'CERRADA');
    const [parameter] = await source.query(
      `INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
       SELECT COALESCE(max(version),0)+1,13,20,2,now()+INTERVAL '1 year',$1 FROM parametros_academicos RETURNING id,version`,
      [adminId],
    );
    const current = await fixture.enroll(group, owner, 'ACTIVA', parameter.id);
    const codes: Code[] = ['T', 'T', 'T', 'T', 'F', 'P', 'P', 'P', 'P', 'P'];
    const sessions = [];
    for (const [index, code] of codes.entries()) {
      const s = await fixture.session(group, 'REALIZADA', await dateAgo(index));
      sessions.push(s);
      await mark(s, old, code);
      await mark(s, current, code);
    }
    const oldSummary = await summary(sessions[0]!, old);
    const currentSummary = await summary(sessions[0]!, current);
    expect(oldSummary).toMatchObject({
      estado: 'CALCULADO',
      faltasComputables: 2,
      inasistenciaPct: '20.00',
      condicion: 'DENTRO_LIMITE',
      reglas: { version: 1, inasistenciaMaxPct: '30.00', tardanzasPorFalta: 3 },
    });
    expect(currentSummary).toMatchObject({
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      condicion: 'RETIRADO_INASISTENCIA',
      reglas: {
        parametroId: parameter.id,
        version: parameter.version,
        inasistenciaMaxPct: '20.00',
        tardanzasPorFalta: 2,
      },
    });
    expect((await history(owner.id, old.id)).resumenAsistencia).toEqual(
      oldSummary,
    );
    expect((await history(owner.id, current.id)).resumenAsistencia).toEqual(
      currentSummary,
    );
    const before = await source.query(
      'SELECT * FROM asistencias WHERE matricula_id=$1 ORDER BY id',
      [old.id],
    );
    await save(sessions[4]!, [entry(current, 'P', 1)]).expect(200);
    expect(
      await source.query(
        'SELECT * FROM asistencias WHERE matricula_id=$1 ORDER BY id',
        [old.id],
      ),
    ).toEqual(before);
    expect(await summary(sessions[0]!, old)).toEqual(oldSummary);
    expect(await summary(sessions[0]!, current)).toMatchObject({
      faltasComputables: 2,
      condicion: 'DENTRO_LIMITE',
    });
  });

  it('una primera marca modifica el resumen de todas las filas, incluida la siguiente página sin marcas', async () => {
    const group = await fixture.group();
    const s = await fixture.session(group);
    const enrollments = [];
    for (let i = 0; i < 21; i++)
      enrollments.push(await fixture.enroll(group, await fixture.student()));
    const before = (await call('get', `${path(s)}?limit=20`).expect(200)).body;
    expect(
      before.items.every(
        (row: MatrixRow) => row.resumenAsistencia.estado === 'SIN_SESIONES',
      ),
    ).toBe(true);
    const saved = (await save(s, [entry(enrollments[0]!, 'F')]).expect(200))
      .body;
    expect(saved.resumenes).toHaveLength(1);
    expect(saved.resumenes[0]).toMatchObject({
      matriculaId: enrollments[0]!.id,
      resumenAsistencia: {
        sesionesComputables: 1,
        faltasComputables: 1,
        condicion: 'RETIRADO_INASISTENCIA',
      },
    });
    const first = (await call('get', `${path(s)}?limit=20`).expect(200)).body;
    const next = (
      await call('get', `${path(s)}?limit=20&after=${first.nextCursor}`).expect(
        200,
      )
    ).body;
    expect(next.items).toHaveLength(1);
    expect(next.items[0].resumenAsistencia).toMatchObject({
      estado: 'INCOMPLETO',
      sesionesComputables: 1,
      marcasPendientes: 1,
      faltasComputables: 0,
      inasistenciaPct: '0.00',
      condicion: null,
    });
    expect(next.items[0].asistencia).toBeNull();
    expect(
      first.items
        .slice(1)
        .every(
          (row: MatrixRow) => row.resumenAsistencia.estado === 'INCOMPLETO',
        ),
    ).toBe(true);
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[])',
        [enrollments.map((m) => m.id)],
      ),
    ).toEqual([]);
  });

  it('dos guardados concurrentes en sesiones distintas dejan una proyección completa coherente sin caché persistida', async () => {
    const group = await fixture.group();
    const enrollment = await fixture.enroll(group, await fixture.student());
    const a = await fixture.session(group);
    const b = await fixture.session(group, 'PROGRAMADA', fixture.yesterday);
    const results = await Promise.all([
      save(a, [entry(enrollment, 'F')]).expect(200),
      save(b, [entry(enrollment, 'F')]).expect(200),
    ]);
    for (const result of results) {
      const calc = result.body.resumenes[0].resumenAsistencia as Summary;
      expect([1, 2]).toContain(calc.sesionesComputables);
      expect(calc.faltasComputables).toBe(
        calc.sesionesComputables - calc.marcasPendientes,
      );
      expect(result.body.resumenes[0].matriculaId).toBe(enrollment.id);
    }
    const expected = {
      estado: 'CALCULADO',
      sesionesComputables: 2,
      faltasComputables: 2,
      marcasPendientes: 0,
      inasistenciaPct: '100.00',
      condicion: 'RETIRADO_INASISTENCIA',
    };
    expect(await summary(a, enrollment)).toMatchObject(expected);
    expect(await summary(b, enrollment)).toMatchObject(expected);
    expect(
      await source.query(
        'SELECT id FROM resultados_academicos WHERE matricula_id=$1',
        [enrollment.id],
      ),
    ).toEqual([]);
  });

  it('un fallo de auditoría revierte marcas y sesión y conserva el resumen anterior sin cálculo persistido', async () => {
    const group = await fixture.group();
    const s = await fixture.session(group);
    const a = await fixture.enroll(group, await fixture.student());
    const b = await fixture.enroll(group, await fixture.student());
    const before = await persistedSnapshot(group);
    const previous = await summary(s, a);
    const audit = app.get(AuditService);
    const original = audit.record.bind(audit);
    let rows = 0;
    vi.spyOn(audit, 'record').mockImplementation(async (...args) => {
      if (args[0].entidad === 'asistencias' && ++rows === 2)
        throw new Error('Fallo sintético de auditoría B13');
      return original(...args);
    });
    const failed = await save(s, [entry(a, 'F'), entry(b, 'P')]).expect(500);
    expect(failed.body.message).toBe('Error interno del servidor');
    expect(
      (
        await source.query('SELECT estado FROM sesiones_clase WHERE id=$1', [
          s.id,
        ])
      )[0].estado,
    ).toBe('PROGRAMADA');
    expect(await persistedSnapshot(group)).toEqual(before);
    expect(await summary(s, a)).toEqual(previous);
  });

  it.each(['secretaria', 'coordinador'])(
    '%s consulta el cálculo autorizado sin editar ni producir resultados',
    async (name) => {
      const f = await dataset(['F', 'P']);
      const user = await login(name);
      expect(await summary(f.sessions[0]!, f.enrollment, user)).toEqual(
        await summary(f.sessions[0]!, f.enrollment),
      );
      await save(f.sessions[0]!, [entry(f.enrollment, 'P', 1)], user).expect(
        403,
      );
      const list = (
        await call('get', `estudiantes/${f.student.id}/historial`, user).expect(
          200,
        )
      ).body;
      expect(list.items[0].resumenAsistencia.sesionesComputables).toBe(2);
    },
  );

  it.each(['SECRETARIA', 'ADMIN'])(
    'DOCENTE+%s puede leer grupo ajeno pero el cálculo no amplía permiso de edición',
    async (role) => {
      const group = await fixture.group(false);
      const s = await fixture.session(group, 'REALIZADA');
      const m = await fixture.enroll(group, await fixture.student());
      await mark(s, m, 'F');
      await call('get', path(s), writer).expect(403);
      await save(s, [entry(m, 'P', 1)]).expect(403);
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [fixture.userIds.docente, adminId, role],
      );
      try {
        expect(await summary(s, m, writer)).toMatchObject({
          faltasComputables: 1,
          condicion: 'RETIRADO_INASISTENCIA',
        });
        await save(s, [entry(m, 'P', 1)]).expect(403);
      } finally {
        await source.query(
          'DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo=$2)',
          [fixture.userIds.docente, role],
        );
      }
    },
  );

  it('revalida asignación y sesión revocadas antes de entregar indicadores académicos', async () => {
    const f = await dataset(['P']);
    await call('get', path(f.sessions[0]!), writer).expect(200);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [f.group.id, fixture.teacherId],
    );
    await call('get', path(f.sessions[0]!), writer).expect(403);
    await save(f.sessions[0]!, [entry(f.enrollment, 'F', 1)]).expect(403);
    expect(await summary(f.sessions[0]!, f.enrollment)).toMatchObject({
      presentes: 1,
      faltasComputables: 0,
    });
    await source.query(
      'UPDATE sesiones_usuario SET revocado_at=now() WHERE usuario_id=$1',
      [fixture.userIds.docente],
    );
    await call('get', path(f.sessions[0]!), writer).expect(401);
  });

  it('conserva un resultado confirmado y uno provisional ya persistidos al consultar o recalcular asistencia', async () => {
    const f = await dataset(['F', 'P', 'P', 'P'], 'CERRADA');
    await source.query(
      `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at)
      VALUES($1,15.50,16,0,1,25,'APROBADO',now())`,
      [f.enrollment.id],
    );
    const activeStudent = await fixture.student();
    const active = await fixture.enroll(f.group, activeStudent);
    for (const s of f.sessions) await mark(s, active, 'P');
    await source.query(
      `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion)
      VALUES($1,12.50,13,0,0,0,NULL)`,
      [active.id],
    );
    const before = await source.query(
      'SELECT * FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[]) ORDER BY id',
      [[f.enrollment.id, active.id]],
    );
    const detail = await history(f.student.id, f.enrollment.id);
    expect(detail.resultado).toMatchObject({
      condicion: 'APROBADO',
      promedio: '15.50',
      notaOficial: 16,
      confirmadoAt: expect.any(String),
    });
    expect(detail.resumenAsistencia).toMatchObject({
      inasistenciaPct: '25.00',
      cierreConfirmado: false,
    });
    await save(f.sessions[0]!, [entry(active, 'F', 1)]).expect(200);
    expect(await summary(f.sessions[0]!, active)).toMatchObject({
      faltasComputables: 1,
      inasistenciaPct: '25.00',
    });
    expect(
      await source.query(
        'SELECT * FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[]) ORDER BY id',
        [[f.enrollment.id, active.id]],
      ),
    ).toEqual(before);
  });

  it('documenta resumen, recálculo del lote y criterio computable en los contratos OpenAPI', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const matrix =
      spec.paths[
        '/api/v1/asistencia/grupos/{grupoId}/sesiones/{sesionId}/asistencias'
      ];
    expect(JSON.stringify(matrix.get.responses['200'])).toContain(
      'resumenAsistencia',
    );
    expect(JSON.stringify(matrix.patch.responses['200'])).toContain(
      'resumenes',
    );
    const histories = Object.entries(spec.paths).filter(([route]) =>
      route.includes('/historial'),
    );
    expect(histories).toHaveLength(2);
    for (const [, contract] of histories)
      expect(JSON.stringify(contract)).toContain('resumenAsistencia');
    expect(JSON.stringify(spec)).toContain('computable');
  });
});
