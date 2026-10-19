import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { GradeCalculationService } from '../src/modules/evaluacion/grade-calculation.service.js';
import { AttendanceCalculationService } from '../src/modules/asistencia/attendance-calculation.service.js';
import type { AttendanceSummary } from '../src/modules/asistencia/attendance-calculation.policy.js';
import {
  insertHistoricalAct,
  insertHistoricalGrade,
} from './student-history.fixture.js';
import { ActasResultados1790208014000 } from '../src/database/migraciones/1790208014000-actas-resultados.js';
import { checkMigrationReversal } from './migration-test.js';
import { ResultCalculationService } from '../src/modules/evaluacion/result-calculation.service.js';
import { freePort } from './browser-server.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureGroup,
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureSession,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B18 con pnpm test:db');

const password = 'Sintetica-segura-B18';
type Login = { cookie: string; csrf: string };
type Code = 'P' | 'F' | 'T' | 'J';
type Mark = { id: string; codigo: Code; version: number };
type Grade = {
  id: string;
  matricula_id: string;
  indicador_id: string;
  nota: string;
  version: number;
  registrado_por: string;
  registrado_at: string;
};
type Configuration = {
  configuracion: { id: string; plan_id: string };
  evaluaciones: { id: string; indicadores: { id: string }[] }[];
};
type GradeSummary = {
  configuracionAprobada: boolean;
  promedio: string | null;
  notaOficial: number | null;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
};
type Result = {
  id: string;
  matricula_id: string;
  cierre_id: string;
  configuracion_id: string;
  version: number;
  promedio: string;
  nota_oficial: number;
  tardanzas_total: number;
  faltas_equivalentes: string;
  inasistencia_pct: string;
  condicion: string;
  calculo: unknown;
  calculado_at: string;
  confirmado_at: string;
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
type ActRow = {
  matricula_id: string;
  estado_matricula: string;
  resumenAsistencia: AttendanceSummary;
  resumenNotas: GradeSummary;
  calculo: { condicion: string | null; listo: boolean; pendientes: string[] };
  resultado: Result | null;
};
type ActEvent = {
  id: string;
  accion: string;
  usuario_id: string;
  ocurrido_at: string;
  motivo: string | null;
  valor_anterior: Result | null;
  valor_nuevo: Result | null;
};
type ActView = {
  grupo: { id: string; estado: string; periodo_estado: string };
  configuracion: Configuration['configuracion'] | null;
  cierre: Closure | null;
  revision: string;
  puedeCerrar: boolean;
  puedeCorregir: boolean;
  pendientes: string[];
  resumen: {
    matriculas: number;
    listos: number;
    aprobados: number;
    desaprobados: number;
    retirados: number;
    pendientes: number;
  };
  items: ActRow[];
  nextCursor: string | null;
  historial: ActEvent[];
};
type Detail = {
  cierre: Closure | null;
  revision: string;
  puedeCorregir: boolean;
  item: ActRow;
  calificaciones: Grade[];
  sesiones: {
    id: string;
    computable: boolean;
    asistencia: Mark | null;
    justificacionId: string | null;
    justificacionEstado: string | null;
  }[];
  historial: ActEvent[];
};

describe('B18 resultados, cierre y corrección de actas HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let teacher: Login;
  let secretary: Login;
  let coordinator: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_acts_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_acts_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b18', password);
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
    admin = await login('admin_b18');
    teacher = await login('docente');
    secretary = await login('secretaria');
    coordinator = await login('coordinador');
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
  async function configure(
    group: AttendanceFixtureGroup,
    indicatorWeights: readonly string[] = ['100'],
  ): Promise<Configuration> {
    const plan = (
      await call('post', `evaluacion/niveles/${group.nivel_id}/planes`)
        .send({
          nombre: `Plan sintético B18 ${++sequence}`,
          formula: 'PONDERADA_JERARQUICA_V1',
          estructura: {
            evaluaciones: [
              {
                nombre: 'Evaluación sintética B18',
                unidadId: null,
                pesoPct: '100',
                orden: 1,
                indicadores: indicatorWeights.map((pesoPct, index) => ({
                  codigo: `SYN-B18-${index + 1}`,
                  descripcion: `Indicador sintético B18 ${index + 1}`,
                  pesoPct,
                  orden: index + 1,
                })),
              },
            ],
          },
        })
        .expect(201)
    ).body.plan as { id: string; revision: number };
    await call('post', `evaluacion/planes/${plan.id}/aprobacion`)
      .send({
        revision: plan.revision,
        referenciaAprobacion: 'Prueba B18; no aprobación institucional real',
        confirmado: true,
      })
      .expect(201);
    return (
      await call('post', `evaluacion/grupos/${group.id}/configuracion`)
        .send({ planId: plan.id, confirmado: true })
        .expect(201)
    ).body as Configuration;
  }
  async function dataset(
    codes: readonly (Code | null)[] = ['P'],
    note: string | null = '12.50',
    parameterId?: string,
    withConfiguration = true,
    indicatorWeights?: readonly string[],
  ) {
    const group = await fixture.group();
    const configuration = withConfiguration
      ? await configure(group, indicatorWeights)
      : null;
    const student = await fixture.student();
    const enrollment = await fixture.enroll(
      group,
      student,
      'ACTIVA',
      parameterId,
    );
    const sessions: AttendanceFixtureSession[] = [];
    const marks: (Mark | null)[] = [];
    for (const [index, code] of codes.entries()) {
      const [date] = await source.query(
        'SELECT ($1::date-$2::int)::text AS fecha',
        [fixture.today, index],
      );
      const session = await fixture.session(
        group,
        'REALIZADA',
        date.fecha as string,
      );
      sessions.push(session);
      if (code === null) marks.push(null);
      else {
        const [mark] = await source.query(
          'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id,codigo,version',
          [group.id, session.id, enrollment.id, code, fixture.userIds.docente],
        );
        marks.push(mark as Mark);
      }
    }
    const indicator = configuration?.evaluaciones[0]!.indicadores[0] ?? null;
    let grade: Grade | null = null;
    if (note !== null && indicator)
      grade = (
        await call(
          'patch',
          `evaluacion/grupos/${group.id}/calificaciones`,
          teacher,
        )
          .send({
            registros: [
              {
                matriculaId: enrollment.id,
                indicadorId: indicator.id,
                nota: note,
                version: null,
              },
            ],
          })
          .expect(200)
      ).body.items[0] as Grade;
    return {
      group,
      configuration,
      student,
      enrollment,
      sessions,
      marks,
      indicator,
      grade,
    };
  }
  type Dataset = Awaited<ReturnType<typeof dataset>>;
  async function closeAttendance(group: AttendanceFixtureGroup) {
    const path = `asistencia/grupos/${group.id}/cierre`;
    const reviewed = (await call('get', path).expect(200)).body as {
      revision: string;
    };
    return (
      await call('post', path)
        .send({
          revision: reviewed.revision,
          confirmarPendientes: true,
          motivo: 'Cierre sintético B18',
        })
        .expect(201)
    ).body as { cierre: { id: string } };
  }
  async function persisted(group: AttendanceFixtureGroup) {
    const [
      groups,
      periods,
      enrollments,
      sessions,
      attendance,
      justifications,
      grades,
      closures,
      results,
      audit,
    ] = await Promise.all([
      source.query('SELECT * FROM grupos WHERE id=$1', [group.id]),
      source.query('SELECT * FROM periodos_academicos WHERE id=$1', [
        group.periodo_id,
      ]),
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
        'SELECT * FROM calificaciones WHERE grupo_id=$1 ORDER BY id',
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
        `SELECT a.* FROM auditoria_eventos a WHERE (a.entidad='cierres_academicos' AND a.entidad_id IN (SELECT id::text FROM cierres_academicos WHERE grupo_id=$1)) OR (a.entidad='resultados_academicos' AND a.entidad_id IN (SELECT r.id::text FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1)) OR (a.entidad='asistencias' AND a.entidad_id IN (SELECT id::text FROM asistencias WHERE grupo_id=$1)) OR (a.entidad='calificaciones' AND a.entidad_id IN (SELECT id::text FROM calificaciones WHERE grupo_id=$1)) OR (a.entidad='matriculas' AND a.entidad_id IN (SELECT id::text FROM matriculas WHERE grupo_id=$1)) ORDER BY a.id`,
        [group.id],
      ),
    ]);
    return {
      groups,
      periods,
      enrollments,
      sessions,
      attendance,
      justifications,
      grades,
      closures,
      results,
      audit,
    };
  }
  async function justified(
    data: Dataset,
    state:
      'PENDIENTE' | 'APROBADA' | 'RECUPERADA' | 'RECHAZADA' | 'NO_RECUPERADA',
  ) {
    const base = `asistencia/grupos/${data.group.id}/justificaciones`;
    let item = (
      await call('post', base, secretary)
        .send({
          asistenciaId: data.marks[0]!.id,
          asistenciaVersion: data.marks[0]!.version,
          motivo: 'Expediente sintético B18',
          fechaPresentacion: fixture.today,
        })
        .expect(201)
    ).body.justificacion as { id: string; version: number };
    if (state === 'PENDIENTE') return item;
    item = (
      await call('patch', `${base}/${item.id}/resolucion`, secretary)
        .send({
          estado: state === 'RECHAZADA' ? 'RECHAZADA' : 'APROBADA',
          version: item.version,
          observacion: 'Resolución sintética B18',
        })
        .expect(200)
    ).body.justificacion as { id: string; version: number };
    if (state === 'APROBADA' || state === 'RECHAZADA') return item;
    return (
      await call('patch', `${base}/${item.id}/recuperacion`, teacher)
        .send({ estado: state, version: item.version })
        .expect(200)
    ).body.justificacion as { id: string; version: number };
  }
  const actPath = (group: AttendanceFixtureGroup) =>
    `evaluacion/grupos/${group.id}/acta`;
  async function view(
    group: AttendanceFixtureGroup,
    actor = admin,
    query = '',
  ) {
    return (await call('get', `${actPath(group)}${query}`, actor).expect(200))
      .body as ActView;
  }
  async function closeAct(
    group: AttendanceFixtureGroup,
    patch: Record<string, unknown> = {},
    expected = 201,
  ) {
    const reviewed = await view(group);
    return call('post', actPath(group))
      .send({
        revision: reviewed.revision,
        motivo: 'Cierre de acta sintética B18',
        ...patch,
      })
      .expect(expected);
  }
  async function detail(data: Dataset, actor = admin) {
    return (
      await call(
        'get',
        `${actPath(data.group)}/${data.enrollment.id}`,
        actor,
      ).expect(200)
    ).body as Detail;
  }
  async function closed(data: Dataset) {
    await closeAttendance(data.group);
    await closeAct(data.group);
    return detail(data);
  }
  function gradeCorrection(
    data: Dataset,
    current: Detail,
    patch: Record<string, unknown> = {},
    actor = admin,
  ) {
    return call('patch', `${actPath(data.group)}/correccion-nota`, actor).send({
      cierreId: current.cierre!.id,
      matriculaId: data.enrollment.id,
      calificacionId: current.calificaciones[0]!.id,
      version: current.calificaciones[0]!.version,
      resultadoVersion: current.item.resultado!.version,
      nota: '12.50',
      motivo: 'Corrección sintética B18 de nota',
      ...patch,
    });
  }
  function attendanceCorrection(
    data: Dataset,
    current: Detail,
    patch: Record<string, unknown> = {},
    actor = admin,
  ) {
    return call(
      'patch',
      `${actPath(data.group)}/correccion-asistencia`,
      actor,
    ).send({
      cierreId: current.cierre!.id,
      matriculaId: data.enrollment.id,
      sesionId: data.sessions[0]!.id,
      version: current.sesiones.find(
        (session) => session.id === data.sessions[0]!.id,
      )!.asistencia!.version,
      resultadoVersion: current.item.resultado!.version,
      codigo: 'P',
      motivo: 'Corrección sintética B18 de asistencia',
      ...patch,
    });
  }

  it('presenta una revisión estable del grupo completo sin persistir resultados al consultar', async () => {
    const data = await dataset();
    const before = await persisted(data.group);
    const first = await view(data.group);
    expect(first).toMatchObject({
      cierre: null,
      puedeCerrar: false,
      resumen: {
        matriculas: 1,
        listos: 1,
        aprobados: 1,
        desaprobados: 0,
        retirados: 0,
        pendientes: 0,
      },
    });
    expect(first.items[0]).toMatchObject({
      matricula_id: data.enrollment.id,
      resultado: null,
      calculo: { condicion: 'APROBADO', listo: true },
      resumenNotas: { promedio: '12.50', notaOficial: 13 },
    });
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect((await view(data.group)).revision).toBe(first.revision);
    expect(first.pendientes.length).toBeGreaterThan(0);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each([
    { absences: 3, note: '12.50', condition: 'APROBADO', official: 13 },
    { absences: 3, note: '12.40', condition: 'DESAPROBADO', official: 12 },
    {
      absences: 4,
      note: '20',
      condition: 'RETIRADO_INASISTENCIA',
      official: 20,
    },
    { absences: 4, note: '0', condition: 'RETIRADO_INASISTENCIA', official: 0 },
  ])(
    'prioriza asistencia con $absences faltas de diez y nota $note → $condition',
    async ({ absences, note, condition, official }) => {
      const data = await dataset(
        Array.from({ length: 10 }, (_, index) =>
          index < absences ? 'F' : 'P',
        ),
        note,
      );
      await closeAttendance(data.group);
      const before = await persisted(data.group);
      const reviewed = await view(data.group);
      expect(reviewed).toMatchObject({ puedeCerrar: true, pendientes: [] });
      expect(reviewed.items[0]!.calculo).toMatchObject({
        condicion: condition,
        listo: true,
        pendientes: [],
      });
      const response = await closeAct(data.group);
      expect(response.body.cantidadResultados).toBe(1);
      expect(response.body.cierre).toMatchObject({
        grupo_id: data.group.id,
        tipo: 'ACTA',
        estado: 'CERRADO',
        realizado_por: adminId,
        revision: reviewed.revision,
      });
      const after = await persisted(data.group);
      expect(after.results).toHaveLength(1);
      const result = after.results[0] as Result;
      expect(result).toMatchObject({
        matricula_id: data.enrollment.id,
        configuracion_id: data.configuration!.configuracion.id,
        cierre_id: response.body.cierre.id,
        version: 1,
        nota_oficial: official,
        condicion: condition,
        calculo: {
          parametroId: before.enrollments[0].parametro_id,
          notaMinima: '13.00',
          configuracionId: data.configuration!.configuracion.id,
        },
      });
      expect(result.confirmado_at).not.toBeNull();
      expect(after.enrollments[0]).toMatchObject({
        ...before.enrollments[0],
        estado: 'CERRADA',
      });
      expect(after.attendance).toEqual(before.attendance);
      expect(after.grades).toEqual(before.grades);
      expect(after.groups).toEqual(before.groups);
      expect(after.periods).toEqual(before.periods);
      expect(after.closures).toHaveLength(2);
      expect((await detail(data)).item.resultado).toMatchObject({
        id: result.id,
        version: 1,
        condicion: condition,
      });
      const repeatBefore = await persisted(data.group);
      await closeAct(data.group, {}, 409);
      expect(await persisted(data.group)).toEqual(repeatBefore);
    },
  );

  it('tres tardanzas forman una falta, conservan el resto y no alteran las marcas originales', async () => {
    const data = await dataset(
      ['F', 'F', 'T', 'T', 'T', 'T', 'P', 'P', 'P', 'P'],
      '12.50',
    );
    const marksBefore = (await persisted(data.group)).attendance;
    const current = await closed(data);
    expect(current.item.resumenAsistencia).toMatchObject({
      tardanzas: 4,
      faltasPorTardanzas: 1,
      tardanzasRestantes: 1,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
    });
    expect(current.item.resultado).toMatchObject({
      tardanzas_total: 4,
      faltas_equivalentes: '3.00',
      inasistencia_pct: '30.00',
      condicion: 'APROBADO',
    });
    expect((await persisted(data.group)).attendance).toEqual(marksBefore);
  });

  it.each([
    'SIN_SOLICITUD',
    'PENDIENTE',
    'APROBADA',
    'RECUPERADA',
    'RECHAZADA',
    'NO_RECUPERADA',
  ] as const)(
    'J %s conserva expediente y marca, y su incidencia al cierre determina la condición',
    async (state) => {
      const data = await dataset([
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
      if (state !== 'SIN_SOLICITUD') await justified(data, state);
      await closeAttendance(data.group);
      const before = await persisted(data.group);
      const closed = (await closeAct(data.group)).body as { cierre: Closure };
      const after = await persisted(data.group);
      expect(after.results[0]).toMatchObject({
        cierre_id: closed.cierre.id,
        inasistencia_pct: state === 'RECUPERADA' ? '30.00' : '40.00',
        condicion:
          state === 'RECUPERADA' ? 'APROBADO' : 'RETIRADO_INASISTENCIA',
      });
      expect(after.attendance).toEqual(before.attendance);
      expect(after.justifications).toEqual(before.justifications);
      expect(after.attendance[0]).toMatchObject({ codigo: 'J' });
      if (state !== 'SIN_SOLICITUD')
        expect(after.justifications[0]).toMatchObject({ estado: state });
    },
  );

  it('una nota pendiente no se convierte en cero ni permite resultado definitivo', async () => {
    const data = await dataset(['F'], null);
    await closeAttendance(data.group);
    const before = await persisted(data.group);
    const reviewed = await view(data.group);
    expect(reviewed.items[0]).toMatchObject({
      resumenNotas: {
        promedio: null,
        notaOficial: null,
        calificacionesPendientes: 1,
      },
      calculo: { condicion: null, listo: false },
      resultado: null,
    });
    await closeAct(data.group, {}, 409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it('usa la nota mínima de la versión del intento y no la versión más reciente', async () => {
    const [parameter] = await source.query(
      `INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por) SELECT max(version)+1,14,30,3,now(),$1 FROM parametros_academicos RETURNING id`,
      [adminId],
    );
    const data = await dataset(['P'], '13.00', parameter.id as string);
    await source.query(
      `INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por) SELECT max(version)+1,10,30,3,now()+INTERVAL '1 year',$1 FROM parametros_academicos`,
      [adminId],
    );
    const current = await closed(data);
    expect(current.item.resultado).toMatchObject({
      nota_oficial: 13,
      condicion: 'DESAPROBADO',
      calculo: { parametroId: parameter.id, notaMinima: '14.00' },
    });
  });

  it.each(['grupo', 'periodo'])(
    'admite cierre administrativo posterior con %s CERRADO y conserva su estado',
    async (variant) => {
      const data = await dataset();
      await closeAttendance(data.group);
      await source.query(
        variant === 'grupo'
          ? "UPDATE grupos SET estado='CERRADO' WHERE id=$1"
          : "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
        [variant === 'grupo' ? data.group.id : data.group.periodo_id],
      );
      const before = await persisted(data.group);
      expect((await view(data.group)).puedeCerrar).toBe(true);
      await closeAct(data.group);
      const after = await persisted(data.group);
      expect(after.groups).toEqual(before.groups);
      expect(after.periods).toEqual(before.periods);
      expect(after.results).toHaveLength(1);
    },
  );

  it('la revisión incluye todo el padrón aunque se consulte una página de una fila', async () => {
    const data = await dataset();
    const second = await fixture.enroll(data.group, await fixture.student());
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [data.group.id, data.sessions[0]!.id, second.id, fixture.userIds.docente],
    );
    await closeAttendance(data.group);
    const first = await view(data.group, admin, '?limit=1');
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect(first.resumen).toMatchObject({
      matriculas: 2,
      listos: 1,
      pendientes: 1,
    });
    expect(first.puedeCerrar).toBe(false);
    const next = await view(
      data.group,
      admin,
      `?limit=1&after=${first.nextCursor}`,
    );
    expect(next.items).toHaveLength(1);
    expect(next.revision).toBe(first.revision);
    expect(next.resumen).toEqual(first.resumen);
    expect(next.items[0]!.matricula_id).not.toBe(first.items[0]!.matricula_id);
    const old = first.revision;
    await call(
      'patch',
      `evaluacion/grupos/${data.group.id}/calificaciones`,
      teacher,
    )
      .send({
        registros: [
          {
            matriculaId: second.id,
            indicadorId: data.indicator!.id,
            nota: '18',
            version: null,
          },
        ],
      })
      .expect(200);
    expect((await view(data.group, admin, '?limit=1')).revision).not.toBe(old);
    await call('post', actPath(data.group)).send({ revision: old }).expect(409);
    const saved = await closeAct(data.group);
    expect(saved.body.cantidadResultados).toBe(2);
    expect((await persisted(data.group)).results).toHaveLength(2);
  });

  it('la nota corregida conserva origen y cierre original y recalcula 12.4→12.5 con auditoría', async () => {
    const data = await dataset(['P'], '12.40');
    const current = await closed(data);
    expect(current.item.resultado!.condicion).toBe('DESAPROBADO');
    const before = await persisted(data.group);
    const response = await gradeCorrection(data, current, {
      nota: '12.50',
      motivo: ' Rectificación sintética contrastada B18 ',
    }).expect(200);
    expect(response.body).toMatchObject({
      cambio: true,
      cierre: { id: current.cierre!.id },
      resultado: {
        id: current.item.resultado!.id,
        version: 2,
        promedio: '12.50',
        nota_oficial: 13,
        condicion: 'APROBADO',
      },
    });
    const after = await persisted(data.group);
    expect(after.grades[0]).toMatchObject({
      id: data.grade!.id,
      registrado_por: data.grade!.registrado_por,
      registrado_at: before.grades[0].registrado_at,
      version: 2,
      nota: '12.50',
    });
    expect(after.results[0].confirmado_at).toEqual(
      before.results[0].confirmado_at,
    );
    expect(after.results[0].cierre_id).toBe(before.results[0].cierre_id);
    expect(after.closures).toEqual(before.closures);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.enrollments).toEqual(before.enrollments);
    const events = after.audit.filter((event: { accion: string }) =>
      ['CORRECT_CLOSED_GRADE', 'CORRECT_ACT_GRADE'].includes(event.accion),
    );
    expect(events).toHaveLength(2);
    for (const event of events)
      expect(event).toMatchObject({
        usuario_id: adminId,
        motivo: 'Rectificación sintética contrastada B18',
        ocurrido_at: expect.any(Date),
        valor_anterior: expect.any(Object),
        valor_nuevo: expect.any(Object),
      });
    const refreshed = await detail(data);
    expect(refreshed.historial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accion: 'CORRECT_ACT_GRADE',
          valor_anterior: expect.objectContaining({
            version: 1,
            condicion: 'DESAPROBADO',
          }),
          valor_nuevo: expect.objectContaining({
            version: 2,
            condicion: 'APROBADO',
          }),
        }),
      ]),
    );
  });

  it('la corrección de asistencia recalcula el retiro en la misma transacción y conserva snapshot', async () => {
    const data = await dataset(
      ['P', 'F', 'F', 'F', 'P', 'P', 'P', 'P', 'P', 'P'],
      '20',
    );
    const current = await closed(data);
    expect(current.item.resultado).toMatchObject({
      condicion: 'APROBADO',
      inasistencia_pct: '30.00',
    });
    const before = await persisted(data.group);
    const response = await attendanceCorrection(data, current, {
      codigo: 'F',
      observacion: 'Marca rectificada',
    }).expect(200);
    expect(response.body).toMatchObject({
      cambio: true,
      resultado: {
        id: current.item.resultado!.id,
        version: 2,
        nota_oficial: 20,
        condicion: 'RETIRADO_INASISTENCIA',
        inasistencia_pct: '40.00',
      },
    });
    const after = await persisted(data.group);
    expect(after.attendance[0]).toMatchObject({
      id: data.marks[0]!.id,
      codigo: 'F',
      version: 2,
      observacion: 'Marca rectificada',
      registrado_por: before.attendance[0].registrado_por,
      registrado_at: before.attendance[0].registrado_at,
    });
    expect(after.grades).toEqual(before.grades);
    expect(after.closures).toEqual(before.closures);
    expect(after.justifications).toEqual(before.justifications);
    expect(
      after.audit
        .slice(before.audit.length)
        .map((event: { accion: string }) => event.accion),
    ).toEqual(
      expect.arrayContaining(['CORRECT_AFTER_CLOSE', 'CORRECT_ACT_ATTENDANCE']),
    );
    const current2 = await detail(data);
    await attendanceCorrection(data, current2, { codigo: 'P' }).expect(200);
    expect((await detail(data)).item.resultado).toMatchObject({
      version: 3,
      condicion: 'APROBADO',
      inasistencia_pct: '30.00',
    });
  });

  it.each(['nota', 'asistencia'])(
    'una corrección de %s sin cambio normalizado no agrega versiones ni auditoría',
    async (kind) => {
      const data = await dataset();
      const current = await closed(data);
      const before = await persisted(data.group);
      const response =
        kind === 'nota'
          ? await gradeCorrection(data, current, { nota: '12.5' }).expect(200)
          : await attendanceCorrection(data, current, { codigo: 'P' }).expect(
              200,
            );
      expect(response.body).toMatchObject({
        cambio: false,
        resultado: { id: current.item.resultado!.id, version: 1 },
      });
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('después del acta el endpoint antiguo de asistencia y las matrices ordinarias no eluden el recálculo', async () => {
    const data = await dataset();
    const current = await closed(data);
    const attendanceClosed = (await persisted(data.group)).closures.find(
      (closure: { tipo: string }) => closure.tipo === 'ASISTENCIA',
    );
    const path = `asistencia/grupos/${data.group.id}/sesiones/${data.sessions[0]!.id}/asistencias`;
    const before = await persisted(data.group);
    const matrix = (await call('get', path).expect(200)).body;
    expect(matrix.puedeEditar).toBe(false);
    expect(matrix.puedeCorregir).toBe(false);
    await call('patch', `${path}/correccion`)
      .send({
        matriculaId: data.enrollment.id,
        codigo: 'F',
        version: 1,
        cierreId: attendanceClosed.id,
        motivo: 'Elusión sintética B18',
      })
      .expect(409);
    await call('patch', path, teacher)
      .send({
        registros: [
          { matriculaId: data.enrollment.id, codigo: 'F', version: 1 },
        ],
      })
      .expect(409);
    await call(
      'patch',
      `evaluacion/grupos/${data.group.id}/calificaciones`,
      teacher,
    )
      .send({
        registros: [
          {
            matriculaId: data.enrollment.id,
            indicadorId: data.indicator!.id,
            nota: '20',
            version: 1,
          },
        ],
      })
      .expect(409);
    expect((await detail(data)).cierre).toEqual(current.cierre);
    expect(await persisted(data.group)).toEqual(before);
  });

  it('una J con expediente conserva decisiones y no puede sustituirse desde corrección de acta', async () => {
    const data = await dataset(['J']);
    await justified(data, 'RECUPERADA');
    const current = await closed(data);
    const before = await persisted(data.group);
    await attendanceCorrection(data, current, { codigo: 'P' }).expect(409);
    expect(await persisted(data.group)).toEqual(before);
    await attendanceCorrection(data, current, {
      codigo: 'J',
      observacion: 'Aclaración sintética B18',
    }).expect(200);
    const after = await persisted(data.group);
    expect(after.justifications).toEqual(before.justifications);
    expect(after.attendance[0]).toMatchObject({
      codigo: 'J',
      version: 2,
      observacion: 'Aclaración sintética B18',
    });
    expect(after.results[0]).toMatchObject({
      version: 2,
      condicion: 'APROBADO',
      inasistencia_pct: '0.00',
    });
  });

  it.each(['docente', 'secretaria', 'coordinador'])(
    '%s no corrige nota ni asistencia después del cierre',
    async (name) => {
      const data = await dataset();
      const current = await closed(data);
      const actor =
        name === 'docente'
          ? teacher
          : name === 'secretaria'
            ? secretary
            : coordinator;
      const before = await persisted(data.group);
      expect((await detail(data, actor)).puedeCorregir).toBe(false);
      await gradeCorrection(data, current, { nota: '20' }, actor).expect(403);
      await attendanceCorrection(data, current, { codigo: 'F' }, actor).expect(
        403,
      );
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it.each([
    {},
    { revision: 'x' },
    { revision: 'A'.repeat(64) },
    { revision: 1 },
    { revision: 'f'.repeat(64), motivo: 'x'.repeat(401) },
    { revision: 'f'.repeat(64), confirmado: true },
    { revision: 'f'.repeat(64), realizadoPor: '1' },
  ])(
    'rechaza un DTO de cierre inválido sin crear estado parcial: %j',
    async (body) => {
      const data = await dataset();
      await closeAttendance(data.group);
      const before = await persisted(data.group);
      await call('post', actPath(data.group)).send(body).expect(400);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it.each([
    { motivo: '' },
    { motivo: '   ' },
    { motivo: 'x'.repeat(401) },
    { nota: '-1' },
    { nota: '20.01' },
    { nota: '12.345' },
    { nota: 12.5 },
    { nota: '12,5' },
    { version: 0 },
    { version: null },
    { resultadoVersion: 0 },
    { resultadoVersion: null },
    { cierreId: 'no-id' },
    { registradoPor: '1' },
  ])('rechaza una corrección de nota inválida: %j', async (patch) => {
    const data = await dataset();
    const current = await closed(data);
    const before = await persisted(data.group);
    await gradeCorrection(data, current, patch).expect(400);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each([
    { motivo: '' },
    { codigo: 'A' },
    { version: null },
    { resultadoVersion: 0 },
    { observacion: 'x'.repeat(251) },
  ])('rechaza una corrección de asistencia inválida: %j', async (patch) => {
    const data = await dataset();
    const current = await closed(data);
    const before = await persisted(data.group);
    await attendanceCorrection(data, current, patch).expect(400);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each(['nota', 'asistencia'])(
    'rechaza versiones obsoletas del resultado o registro al corregir %s',
    async (kind) => {
      const data = await dataset();
      const current = await closed(data);
      const before = await persisted(data.group);
      for (const patch of [
        { version: 2 },
        { resultadoVersion: 2 },
        { cierreId: '999999999' },
      ]) {
        if (kind === 'nota')
          await gradeCorrection(data, current, { nota: '20', ...patch }).expect(
            409,
          );
        else
          await attendanceCorrection(data, current, {
            codigo: 'F',
            ...patch,
          }).expect(409);
      }
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('no usa calificación ni sesión de otro grupo, ni cambia la identidad del intento', async () => {
    const first = await dataset();
    const foreign = await dataset();
    const current = await closed(first);
    const before = await persisted(first.group);
    const foreignBefore = await persisted(foreign.group);
    await gradeCorrection(first, current, {
      nota: '20',
      calificacionId: foreign.grade!.id,
    }).expect(404);
    await gradeCorrection(first, current, {
      nota: '20',
      matriculaId: foreign.enrollment.id,
    }).expect(404);
    await attendanceCorrection(first, current, {
      codigo: 'F',
      sesionId: foreign.sessions[0]!.id,
    }).expect(404);
    await attendanceCorrection(first, current, {
      codigo: 'F',
      matriculaId: foreign.enrollment.id,
    }).expect(404);
    await call(
      'get',
      `${actPath(first.group)}/${foreign.enrollment.id}`,
    ).expect(404);
    expect(await persisted(first.group)).toEqual(before);
    expect(await persisted(foreign.group)).toEqual(foreignBefore);
  });

  it('la corrección administrativa funciona después del cierre del grupo y del periodo', async () => {
    const data = await dataset(['P'], '12.40');
    const current = await closed(data);
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      data.group.id,
    ]);
    await source.query(
      "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
      [data.group.periodo_id],
    );
    const before = await persisted(data.group);
    await gradeCorrection(data, current).expect(200);
    const updated = await detail(data);
    expect(updated.item.resultado!.condicion).toBe('APROBADO');
    await attendanceCorrection(data, updated, { codigo: 'F' }).expect(200);
    const after = await persisted(data.group);
    expect(after.results[0]).toMatchObject({
      version: 3,
      condicion: 'RETIRADO_INASISTENCIA',
    });
    expect(after.groups).toEqual(before.groups);
    expect(after.periods).toEqual(before.periods);
    expect(after.closures).toEqual(before.closures);
  });

  it('el acta no permite sustituir una sesión programada, cancelada o futura del corte', async () => {
    const data = await dataset();
    const planned = await fixture.session(
      data.group,
      'PROGRAMADA',
      fixture.yesterday,
    );
    const future = await fixture.session(
      data.group,
      'REALIZADA',
      fixture.tomorrow,
    );
    const [date] = await source.query('SELECT ($1::date-2)::text AS fecha', [
      fixture.today,
    ]);
    const cancelled = await fixture.session(
      data.group,
      'CANCELADA',
      date.fecha as string,
    );
    const current = await closed(data);
    expect(
      current.sesiones.filter((session) => session.computable),
    ).toHaveLength(1);
    const before = await persisted(data.group);
    for (const session of [planned, future, cancelled])
      await attendanceCorrection(data, current, {
        sesionId: session.id,
        version: 1,
        codigo: 'F',
      }).expect(409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it('dos cierres concurrentes producen exactamente un acta y un resultado por intento', async () => {
    const data = await dataset();
    await closeAttendance(data.group);
    const reviewed = await view(data.group);
    const responses = await Promise.all([
      call('post', actPath(data.group)).send({ revision: reviewed.revision }),
      call('post', actPath(data.group)).send({ revision: reviewed.revision }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const after = await persisted(data.group);
    expect(
      after.closures.filter(
        (closure: { tipo: string }) => closure.tipo === 'ACTA',
      ),
    ).toHaveLength(1);
    expect(after.results).toHaveLength(1);
    expect(after.results[0].version).toBe(1);
    expect(after.enrollments[0].estado).toBe('CERRADA');
  });

  it('dos correcciones concurrentes sobre una nota permiten exactamente una versión posterior', async () => {
    const data = await dataset(['P'], '12.40');
    const current = await closed(data);
    const responses = await Promise.all([
      gradeCorrection(data, current, { nota: '15' }),
      gradeCorrection(data, current, { nota: '16' }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const after = await persisted(data.group);
    expect(after.grades[0].version).toBe(2);
    expect(after.results[0].version).toBe(2);
    expect(
      after.audit.filter(
        (event: { accion: string }) => event.accion === 'CORRECT_ACT_GRADE',
      ),
    ).toHaveLength(1);
  });

  it('correcciones simultáneas de asistencia y nota comparten la versión del resultado', async () => {
    const data = await dataset(['P'], '12.40');
    const current = await closed(data);
    const responses = await Promise.all([
      gradeCorrection(data, current, { nota: '20' }),
      attendanceCorrection(data, current, { codigo: 'F' }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const after = await persisted(data.group);
    expect(after.results[0].version).toBe(2);
    expect(after.grades[0].version + after.attendance[0].version).toBe(3);
    const refreshed = await detail(data);
    expect(refreshed.item.resultado!.condicion).toBe(
      refreshed.item.calculo.condicion,
    );
  });

  it.each(['auditoría', 'lectura posterior'])(
    'un fallo de %s revierte acta, resultados y estados de matrícula',
    async (mode) => {
      const data = await dataset();
      await closeAttendance(data.group);
      const before = await persisted(data.group);
      const reviewed = await view(data.group);
      if (mode === 'auditoría') {
        const original = app
          .get(AuditService)
          .record.bind(app.get(AuditService));
        vi.spyOn(app.get(AuditService), 'record').mockImplementation(
          async (event, manager) => {
            if (event.accion === 'CLOSE_ACT')
              throw new Error('Fallo sintético B18 de auditoría al finalizar');
            await original(event, manager);
          },
        );
      } else {
        const original = app
          .get(ResultCalculationService)
          .summaries.bind(app.get(ResultCalculationService));
        vi.spyOn(app.get(ResultCalculationService), 'summaries')
          .mockImplementationOnce(original)
          .mockRejectedValueOnce(
            new Error('Fallo sintético B18 de lectura posterior'),
          );
      }
      await call('post', actPath(data.group))
        .send({ revision: reviewed.revision })
        .expect(500);
      expect(await persisted(data.group)).toEqual(before);
      vi.restoreAllMocks();
      await closeAct(data.group);
    },
  );

  it.each(['nota', 'asistencia'])(
    'un fallo de auditoría revierte la corrección de %s y el resultado asociado',
    async (kind) => {
      const data = await dataset(['P'], '12.40');
      const current = await closed(data);
      const before = await persisted(data.group);
      const original = app.get(AuditService).record.bind(app.get(AuditService));
      vi.spyOn(app.get(AuditService), 'record').mockImplementation(
        async (event, manager) => {
          if (
            event.accion === 'CORRECT_ACT_GRADE' ||
            event.accion === 'CORRECT_ACT_ATTENDANCE'
          )
            throw new Error(
              'Fallo sintético B18 de auditoría del resultado correctivo',
            );
          await original(event, manager);
        },
      );
      if (kind === 'nota') await gradeCorrection(data, current).expect(500);
      else
        await attendanceCorrection(data, current, { codigo: 'F' }).expect(500);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it.each(['nota', 'asistencia'])(
    'un fallo de cálculo revierte la corrección de %s con sus versiones y auditoría',
    async (kind) => {
      const data = await dataset(['P'], '12.40');
      const current = await closed(data);
      const before = await persisted(data.group);
      if (kind === 'nota')
        vi.spyOn(
          app.get(GradeCalculationService),
          'summaries',
        ).mockRejectedValueOnce(
          new Error('Fallo sintético B18 al calcular notas'),
        );
      else
        vi.spyOn(
          app.get(AttendanceCalculationService),
          'summaries',
        ).mockRejectedValueOnce(
          new Error('Fallo sintético B18 al calcular asistencia'),
        );
      if (kind === 'nota') await gradeCorrection(data, current).expect(500);
      else
        await attendanceCorrection(data, current, { codigo: 'F' }).expect(500);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('una sesión, una matrícula y notas no sustituyen la aprobación institucional de criterios', async () => {
    const data = await dataset(['P'], null, undefined, false);
    await closeAttendance(data.group);
    const before = await persisted(data.group);
    const response = await call('get', actPath(data.group)).expect(200);
    expect(response.body.puedeCerrar).toBe(false);
    await call('post', actPath(data.group))
      .send({ revision: response.body.revision })
      .expect(409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it('rechaza la consulta sin sesión y al docente sin pertenencia al grupo', async () => {
    const data = await dataset();
    const before = await persisted(data.group);
    await request(app.getHttpServer())
      .get(`/api/v1/${actPath(data.group)}`)
      .expect(401);
    for (const name of ['ajeno']) {
      const actor = await login(name);
      await call('get', actPath(data.group), actor).expect(403);
    }
    const assigned = await login('docente2');
    await call('get', actPath(data.group), assigned).expect(200);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [data.group.id, fixture.teacherId],
    );
    await call('get', actPath(data.group), teacher).expect(403);
    const after = await persisted(data.group);
    expect(after.results).toEqual(before.results);
    expect(after.closures).toEqual(before.closures);
  });

  it.each(['docente', 'secretaria', 'coordinador'])(
    '%s consulta pero no cierra ni corrige actas',
    async (name) => {
      const data = await dataset();
      await closeAttendance(data.group);
      const actor =
        name === 'docente'
          ? teacher
          : name === 'secretaria'
            ? secretary
            : coordinator;
      const view = (await call('get', actPath(data.group), actor).expect(200))
        .body;
      expect(view.puedeCerrar).toBe(false);
      const before = await persisted(data.group);
      await call('post', actPath(data.group), actor)
        .send({ revision: view.revision })
        .expect(403);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it.each(['PLANIFICADO-grupo', 'PLANIFICADO-periodo'])(
    'rechaza cerrar con %s aunque los datos estén completos',
    async (state) => {
      const data = await dataset();
      await closeAttendance(data.group);
      await source.query(
        state.endsWith('grupo')
          ? "UPDATE grupos SET estado='PLANIFICADO' WHERE id=$1"
          : "UPDATE periodos_academicos SET estado='PLANIFICADO' WHERE id=$1",
        [state.endsWith('grupo') ? data.group.id : data.group.periodo_id],
      );
      const before = await persisted(data.group);
      const viewed = (await call('get', actPath(data.group)).expect(200)).body;
      expect(viewed.puedeCerrar).toBe(false);
      await call('post', actPath(data.group))
        .send({ revision: viewed.revision })
        .expect(409);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it.each([
    'sin sesiones',
    'sin matrícula',
    'marcas pendientes',
    'notas pendientes',
    'asistencia abierta',
  ])('no confirma resultados con %s', async (pending) => {
    const data = await dataset(
      pending === 'sin sesiones'
        ? []
        : pending === 'marcas pendientes'
          ? [null]
          : ['P'],
      pending === 'notas pendientes' ? null : '12.50',
    );
    if (pending === 'sin matrícula')
      await source.query(
        "UPDATE matriculas SET estado='ANULADA',motivo_anulacion='Anulación sintética B18' WHERE id=$1",
        [data.enrollment.id],
      );
    if (pending !== 'asistencia abierta') await closeAttendance(data.group);
    const before = await persisted(data.group);
    const viewed = (await call('get', actPath(data.group)).expect(200)).body;
    expect(viewed.puedeCerrar).toBe(false);
    await call('post', actPath(data.group))
      .send({ revision: viewed.revision })
      .expect(409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each([false, true])(
    'un resultado legacy confirmado=%s bloquea la emisión sin sobrescribirlo',
    async (confirmed) => {
      const data = await dataset();
      await closeAttendance(data.group);
      await source.query(
        `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,0,0,'APROBADO',${confirmed ? 'now()' : 'NULL'})`,
        [data.enrollment.id],
      );
      const before = await persisted(data.group);
      const viewed = (await call('get', actPath(data.group)).expect(200)).body;
      expect(viewed.puedeCerrar).toBe(false);
      await call('post', actPath(data.group))
        .send({ revision: viewed.revision })
        .expect(409);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('un acta histórica permanece en consulta sin aprobar automáticamente sus criterios ni habilitar corrección', async () => {
    const data = await dataset(['P'], null, undefined, false);
    await insertHistoricalAct(source, data.group.id, adminId);
    const before = await persisted(data.group);
    const viewed = (await call('get', actPath(data.group)).expect(200)).body;
    expect(viewed.puedeCerrar).toBe(false);
    await call('post', actPath(data.group))
      .send({ revision: viewed.revision })
      .expect(409);
    expect(await persisted(data.group)).toEqual(before);
    expect(before.results).toHaveLength(0);
    expect((await detail(data)).puedeCorregir).toBe(false);
  });

  it('el cierre incluye matrículas históricas CERRADA completas y excluye pendientes y anuladas', async () => {
    const data = await dataset();
    const historical: AttendanceFixtureEnrollment = await fixture.enroll(
      data.group,
      await fixture.student(),
      'CERRADA',
    );
    await fixture.enroll(data.group, await fixture.student(), 'PENDIENTE');
    await fixture.enroll(data.group, await fixture.student(), 'ANULADA');
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [
        data.group.id,
        data.sessions[0]!.id,
        historical.id,
        fixture.userIds.docente,
      ],
    );
    await insertHistoricalGrade(source, {
      matriculaId: historical.id,
      indicadorId: data.indicator!.id,
      grupoId: data.group.id,
      nota: '0.00',
      registradoPor: fixture.userIds.docente!,
    });
    await closeAttendance(data.group);
    const before = await persisted(data.group);
    const reviewed = await view(data.group);
    expect(reviewed.resumen).toMatchObject({
      matriculas: 2,
      listos: 2,
      aprobados: 1,
      desaprobados: 1,
    });
    const saved = await closeAct(data.group);
    expect(saved.body.cantidadResultados).toBe(2);
    const after = await persisted(data.group);
    expect(after.results).toHaveLength(2);
    expect(
      after.results.find(
        (result: Result) => result.matricula_id === historical.id,
      ),
    ).toMatchObject({ nota_oficial: 0, condicion: 'DESAPROBADO' });
    expect(
      after.enrollments.filter((enrollment: { estado: string }) =>
        ['PENDIENTE', 'ANULADA'].includes(enrollment.estado),
      ),
    ).toEqual(
      before.enrollments.filter((enrollment: { estado: string }) =>
        ['PENDIENTE', 'ANULADA'].includes(enrollment.estado),
      ),
    );
  });

  it('otra matrícula del mismo estudiante conserva asistencia, notas y resultado del intento anterior', async () => {
    const first = await dataset(['P'], '10.00');
    await closed(first);
    const before = await persisted(first.group);
    const secondGroup = await fixture.group();
    const config = await configure(secondGroup);
    const second = await fixture.enroll(secondGroup, first.student);
    expect(second.numero_intento).toBe(first.enrollment.numero_intento + 1);
    const session = await fixture.session(secondGroup, 'REALIZADA');
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [secondGroup.id, session.id, second.id, fixture.userIds.docente],
    );
    await call(
      'patch',
      `evaluacion/grupos/${secondGroup.id}/calificaciones`,
      teacher,
    )
      .send({
        registros: [
          {
            matriculaId: second.id,
            indicadorId: config.evaluaciones[0]!.indicadores[0]!.id,
            nota: '20',
            version: null,
          },
        ],
      })
      .expect(200);
    await closeAttendance(secondGroup);
    await closeAct(secondGroup);
    expect(await persisted(first.group)).toEqual(before);
    expect((await persisted(secondGroup)).results[0]).toMatchObject({
      matricula_id: second.id,
      condicion: 'APROBADO',
    });
  });

  it('SQL exige contexto local y no deja confirmar un acta sin resultados y estados en la misma transacción', async () => {
    const data = await dataset();
    await closeAttendance(data.group);
    const before = await persisted(data.group);
    const insert =
      "INSERT INTO cierres_academicos(grupo_id,tipo,estado,realizado_por,revision,resumen) VALUES($1,'ACTA','CERRADO',$2,$3,'{}')";
    await expect(
      source.query(insert, [data.group.id, adminId, 'f'.repeat(64)]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      source.transaction(async (manager) => {
        await manager.query("SELECT set_config('excel.act_command',$1,true)", [
          `close:${data.group.id}`,
        ]);
        await manager.query(insert, [data.group.id, adminId, 'f'.repeat(64)]);
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(data.group)).toEqual(before);
    await closeAct(data.group);
  });

  it('SQL conserva procedencia, fechas, estados e historial de resultados y cierre', async () => {
    const data = await dataset();
    const current = await closed(data);
    const result = current.item.resultado!;
    const before = await persisted(data.group);
    await expect(
      source.query(
        'UPDATE resultados_academicos SET promedio=20,version=version+1 WHERE id=$1',
        [result.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    for (const query of [
      'UPDATE resultados_academicos SET matricula_id=matricula_id+1,version=version+1 WHERE id=$1',
      'UPDATE resultados_academicos SET cierre_id=NULL,version=version+1 WHERE id=$1',
      'UPDATE resultados_academicos SET configuracion_id=NULL,version=version+1 WHERE id=$1',
      "UPDATE resultados_academicos SET confirmado_at=now()+INTERVAL '1 second',version=version+1 WHERE id=$1",
      'DELETE FROM resultados_academicos WHERE id=$1',
    ])
      await expect(source.query(query, [result.id])).rejects.toMatchObject({
        driverError: { code: '23001' },
      });
    await expect(
      source.query('TRUNCATE resultados_academicos CASCADE'),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      source.query("UPDATE matriculas SET estado='ACTIVA' WHERE id=$1", [
        data.enrollment.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      source.query(
        "UPDATE cierres_academicos SET motivo='Alteración' WHERE id=$1",
        [current.cierre!.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      source.query('DELETE FROM cierres_academicos WHERE id=$1', [
        current.cierre!.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each(['nota', 'asistencia'])(
    'SQL no confirma una corrección de %s sin actualizar el resultado derivado',
    async (kind) => {
      const data = await dataset();
      const current = await closed(data);
      const attendanceClosure = (await persisted(data.group)).closures.find(
        (closure: { tipo: string }) => closure.tipo === 'ASISTENCIA',
      );
      const before = await persisted(data.group);
      await expect(
        source.transaction(async (manager) => {
          await manager.query(
            "SELECT set_config('excel.act_command',$1,true)",
            [`correct:${current.cierre!.id}`],
          );
          if (kind === 'nota')
            await manager.query(
              'UPDATE calificaciones SET nota=20,version=version+1 WHERE id=$1',
              [data.grade!.id],
            );
          else {
            await manager.query(
              "SELECT set_config('excel.attendance_correction',$1,true)",
              [attendanceClosure.id],
            );
            await manager.query(
              "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
              [data.marks[0]!.id],
            );
          }
        }),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('SQL rechaza valores derivados y snapshots falsos aun con el contexto de corrección', async () => {
    const data = await dataset();
    const current = await closed(data);
    const result = current.item.resultado!;
    const before = await persisted(data.group);
    for (const assignment of [
      'promedio=19',
      'nota_oficial=20',
      "condicion='DESAPROBADO'",
      'faltas_equivalentes=2',
      'inasistencia_pct=100',
      "calculo=jsonb_set(calculo,'{notaMinima}','\"1.00\"')",
      "calculo=jsonb_set(calculo,'{planId}','\"999999999\"')",
      "calculo=jsonb_set(calculo,'{resumenNotas,promedio}','\"20\"')",
    ])
      await expect(
        source.transaction(async (manager) => {
          await manager.query(
            "SELECT set_config('excel.act_command',$1,true)",
            [`correct:${current.cierre!.id}`],
          );
          await manager.query(
            `UPDATE resultados_academicos SET ${assignment},version=version+1 WHERE id=$1`,
            [result.id],
          );
        }),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(data.group)).toEqual(before);
  });

  it('un snapshot SQL anterior al acta no puede registrar notas ni corregir asistencia después del cierre', async () => {
    for (const kind of ['nota', 'asistencia']) {
      const data = await dataset();
      await closeAttendance(data.group);
      const runner = source.createQueryRunner();
      try {
        await runner.startTransaction('REPEATABLE READ');
        await runner.query('SELECT id FROM grupos WHERE id=$1', [
          data.group.id,
        ]);
        await closeAct(data.group);
        await expect(
          kind === 'nota'
            ? runner.query(
                'UPDATE calificaciones SET nota=20,version=version+1 WHERE id=$1',
                [data.grade!.id],
              )
            : runner.query(
                "UPDATE asistencias SET codigo='F',version=version+1 WHERE id=$1",
                [data.marks[0]!.id],
              ),
        ).rejects.toMatchObject({ driverError: { code: '40001' } });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      const after = await persisted(data.group);
      expect(after.grades[0].nota).toBe('12.50');
      expect(after.attendance[0].codigo).toBe('P');
      expect(after.results[0].version).toBe(1);
    }
  });

  it('la reversión B18 rechaza el acta persistida sin perder snapshot ni resultado', async () => {
    const data = await dataset();
    await closed(data);
    const before = await persisted(data.group);
    await expect(
      checkMigrationReversal(source, new ActasResultados1790208014000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(data.group)).toEqual(before);
  });

  it('OpenAPI describe consulta, cierre y correcciones con versiones sin habilitar reapertura ni XLSX', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const base = '/api/v1/evaluacion/grupos/{grupoId}/acta';
    expect(spec.paths[base].get).toBeDefined();
    expect(spec.paths[base].post).toBeDefined();
    expect(spec.paths[`${base}/{matriculaId}`].get).toBeDefined();
    expect(spec.paths[`${base}/correccion-nota`].patch).toBeDefined();
    expect(spec.paths[`${base}/correccion-asistencia`].patch).toBeDefined();
    expect(JSON.stringify(spec.paths[base])).toContain('resumenAsistencia');
    expect(JSON.stringify(spec.paths[base])).toContain('calculo');
    expect(spec.components.schemas.CorrectActGradeDto.required).toEqual(
      expect.arrayContaining([
        'resultadoVersion',
        'version',
        'cierreId',
        'matriculaId',
        'calificacionId',
        'motivo',
        'nota',
      ]),
    );
    expect(
      spec.components.schemas.CorrectActGradeDto.properties.resultadoVersion,
    ).toMatchObject({ minimum: 1, maximum: 2147483647 });
    expect(
      Object.keys(spec.paths).some(
        (path) =>
          path.startsWith('/api/v1/evaluacion') && /reapertura|xlsx/.test(path),
      ),
    ).toBe(false);
  });

  it('CSRF y sesión revocada impiden el cierre incluso con la revisión correcta', async () => {
    const data = await dataset();
    await closeAttendance(data.group);
    const reviewed = await view(data.group);
    const before = await persisted(data.group);
    await request(app.getHttpServer())
      .post(`/api/v1/${actPath(data.group)}`)
      .set('Origin', origin)
      .set('Cookie', admin.cookie)
      .set('X-Requested-With', 'Excel-Web')
      .send({ revision: reviewed.revision })
      .expect(403);
    await call('post', 'auth/logout').send({}).expect(204);
    await call('post', actPath(data.group))
      .send({ revision: reviewed.revision })
      .expect(401);
    expect(await persisted(data.group)).toEqual(before);
  });

  it('persiste 12.495 exacto en el acta y conserva el redondeo oficial a 12', async () => {
    const data = await dataset(['P'], null, undefined, true, ['50', '50']);
    const indicators = data.configuration!.evaluaciones[0]!.indicadores;
    await call(
      'patch',
      `evaluacion/grupos/${data.group.id}/calificaciones`,
      teacher,
    )
      .send({
        registros: indicators.map((indicator, index) => ({
          matriculaId: data.enrollment.id,
          indicadorId: indicator.id,
          nota: index === 0 ? '12.49' : '12.50',
          version: null,
        })),
      })
      .expect(200);
    const current = await closed(data);
    expect(current.item.resultado).toMatchObject({
      promedio: '12.495',
      nota_oficial: 12,
      condicion: 'DESAPROBADO',
      calculo: { resumenNotas: { promedio: '12.495', notaOficial: 12 } },
    });
    expect((await persisted(data.group)).results[0]).toMatchObject({
      promedio: '12.495',
      nota_oficial: 12,
    });
    await gradeCorrection(data, current, { nota: '12.50' }).expect(200);
    expect((await detail(data)).item.resultado).toMatchObject({
      promedio: '12.50',
      nota_oficial: 13,
      condicion: 'APROBADO',
      version: 2,
    });
  });

  it.each(['PENDIENTE', 'ANULADA'] as const)(
    'un resultado legacy de matrícula %s fuera del padrón impide ofrecer y cerrar un acta nueva',
    async (state) => {
      const data = await dataset();
      const excluded = await fixture.enroll(
        data.group,
        await fixture.student(),
        state,
      );
      await closeAttendance(data.group);
      const original = await view(data.group);
      expect(original.puedeCerrar).toBe(true);
      await source.query(
        "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion) VALUES($1,15,15,0,0,0,'APROBADO')",
        [excluded.id],
      );
      const before = await persisted(data.group);
      const updated = await view(data.group);
      expect(updated.items.map((item) => item.matricula_id)).toEqual([
        data.enrollment.id,
      ]);
      expect(updated.puedeCerrar).toBe(false);
      expect(updated.revision).not.toBe(original.revision);
      await call('post', actPath(data.group))
        .send({ revision: updated.revision })
        .expect(409);
      expect(await persisted(data.group)).toEqual(before);
    },
  );

  it('la reversión también conserva un promedio legacy con más de dos decimales sin ningún acta', async () => {
    await source.query('CREATE DATABASE excel_acts_precision_test');
    const isolated = await new DataSource(
      databaseOptions({ ...process.env, DB_NAME: 'excel_acts_precision_test' }),
    ).initialize();
    try {
      await isolated.runMigrations();
      await seedDemo(isolated);
      const [person] = await isolated.query(
        "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO','SYN-B18-PRECISION','Precisión B18','Sintético') RETURNING id",
      );
      const [student] = await isolated.query(
        "INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,'SYN-B18-PRECISION',CURRENT_DATE) RETURNING id",
        [person.id],
      );
      const [enrollment] = await isolated.query(
        `INSERT INTO matriculas(codigo,estudiante_id,grupo_id,nivel_id,parametro_id,numero_intento,fecha_matricula,estado,registrado_por)
        SELECT 'SYN-B18-PRECISION',$1,g.id,g.nivel_id,p.id,1,CURRENT_DATE,'PENDIENTE',u.id FROM grupos g CROSS JOIN parametros_academicos p CROSS JOIN usuarios u WHERE g.codigo='DEMO-EN-G1' AND u.nombre_usuario='demo_b02_inactivo' RETURNING id`,
        [student.id],
      );
      await isolated.query(
        "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion) VALUES($1,12.495,12,0,0,0,'DESAPROBADO')",
        [enrollment.id],
      );
      expect(
        await isolated.query(
          "SELECT id FROM cierres_academicos WHERE tipo='ACTA'",
        ),
      ).toEqual([]);
      const before = await isolated.query(
        'SELECT * FROM resultados_academicos',
      );
      await expect(
        checkMigrationReversal(isolated, new ActasResultados1790208014000()),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      expect(
        await isolated.query('SELECT * FROM resultados_academicos'),
      ).toEqual(before);
      expect(before[0]).toMatchObject({
        promedio: '12.495',
        cierre_id: null,
        configuracion_id: null,
        calculo: null,
      });
    } finally {
      if (isolated.isInitialized) await isolated.destroy();
    }
  }, 60000);

  it.each(['nota', 'asistencia', 'estado'])(
    'una modificación de %s invalida la revisión anterior al cierre',
    async (kind) => {
      const data = await dataset();
      const closedAttendance = await closeAttendance(data.group);
      const old = await view(data.group);
      if (kind === 'nota')
        await call(
          'patch',
          `evaluacion/grupos/${data.group.id}/calificaciones`,
          teacher,
        )
          .send({
            registros: [
              {
                matriculaId: data.enrollment.id,
                indicadorId: data.indicator!.id,
                nota: '20',
                version: 1,
              },
            ],
          })
          .expect(200);
      else if (kind === 'asistencia')
        await call(
          'patch',
          `asistencia/grupos/${data.group.id}/sesiones/${data.sessions[0]!.id}/asistencias/correccion`,
        )
          .send({
            cierreId: closedAttendance.cierre.id,
            matriculaId: data.enrollment.id,
            codigo: 'F',
            version: 1,
            motivo: 'Rectificación anterior al acta sintética B18',
          })
          .expect(200);
      else
        await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
          data.group.id,
        ]);
      const before = await persisted(data.group);
      expect((await view(data.group)).revision).not.toBe(old.revision);
      await call('post', actPath(data.group))
        .send({ revision: old.revision })
        .expect(409);
      expect(await persisted(data.group)).toEqual(before);
      await closeAct(data.group);
    },
  );
});
