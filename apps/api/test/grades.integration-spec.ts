import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { GradeCalculationService } from '../src/modules/evaluacion/grade-calculation.service.js';
import { CalificacionesAbiertas1790208013000 } from '../src/database/migraciones/1790208013000-calificaciones-abiertas.js';
import { checkMigrationReversal } from './migration-test.js';
import {
  insertHistoricalAct,
  insertHistoricalGrade,
} from './student-history.fixture.js';
import { freePort } from './browser-server.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureEnrollment,
  type AttendanceFixtureGroup,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B17 con pnpm test:db');

const password = 'Sintetica-segura-B17';
type Login = { cookie: string; csrf: string };
type Definition = {
  evaluaciones: {
    nombre: string;
    unidadId: string | null;
    pesoPct: string;
    orden: number;
    indicadores: {
      codigo: string;
      descripcion: string;
      pesoPct: string;
      orden: number;
    }[];
  }[];
};
type Plan = { id: string; revision: number; estado: string };
type ConfiguredGroup = {
  configuracion: { id: string; plan_id: string };
  evaluaciones: {
    id: string;
    indicadores: { id: string; codigo: string }[];
  }[];
};
type Grade = {
  id: string;
  matricula_id: string;
  indicador_id: string;
  grupo_id: string;
  nota: string;
  version: number;
  registrado_por: string;
  registrado_at: string;
  actualizado_at: string | null;
};
type GradeSummary = {
  configuracionAprobada: boolean;
  promedio: string | null;
  notaOficial: number | null;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
  motivoPendiente: string | null;
};
type GradeRow = {
  matricula_id: string;
  numero_intento: number;
  estado_matricula: string;
  editable: boolean;
  calificaciones: Grade[];
  resumenNotas: GradeSummary;
};
type Matrix = {
  items: GradeRow[];
  nextCursor: string | null;
  puedeEditar: boolean;
  motivoSoloLectura: string | null;
  configuracion: { id: string; plan_id: string } | null;
  plan: Plan | null;
  acta: { cerrada: boolean; cierre: { id: string } | null };
  preparacionActa: {
    calificacionesEsperadas: number;
    calificacionesRegistradas: number;
    calificacionesPendientes: number;
    puedeCerrar: boolean;
  };
};
type Cell = {
  matriculaId: string;
  indicadorId: string;
  nota: string;
  version: number | null;
};
type Saved = {
  items: Grade[];
  resumenes: { matriculaId: string; resumenNotas: GradeSummary }[];
  preparacionActa: Matrix['preparacionActa'];
};
type History = {
  calificacion: Grade | null;
  items: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
    valor_anterior: Grade | null;
    valor_nuevo: Grade;
  }[];
};

describe('B17 calificaciones abiertas, promedio y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let teacher: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;

  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_grades_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_grades_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b17', password);
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
    admin = await login('admin_b17');
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
  function definition(
    weights: readonly string[] = ['50', '50'],
    indicatorWeights: readonly string[] = ['50', '50'],
  ): Definition {
    return {
      evaluaciones: weights.map((pesoPct, index) => ({
        nombre: `Evaluación sintética B17 ${index + 1}`,
        unidadId: null,
        pesoPct,
        orden: index + 1,
        indicadores: indicatorWeights.map((weight, order) => ({
          codigo: `SYN-B17-${order + 1}`,
          descripcion: `Indicador sintético B17 ${order + 1}`,
          pesoPct: weight,
          orden: order + 1,
        })),
      })),
    };
  }
  async function approved(levelId: string, structure = definition()) {
    const plan = (
      await call('post', `evaluacion/niveles/${levelId}/planes`)
        .send({
          nombre: `Plan sintético B17 ${++sequence}`,
          formula: 'PONDERADA_JERARQUICA_V1',
          estructura: structure,
        })
        .expect(201)
    ).body.plan as Plan;
    return (
      await call('post', `evaluacion/planes/${plan.id}/aprobacion`)
        .send({
          revision: plan.revision,
          referenciaAprobacion: 'Prueba B17; no aprobación institucional real',
          confirmado: true,
        })
        .expect(201)
    ).body.plan as Plan;
  }
  async function configure(
    group: AttendanceFixtureGroup,
    structure = definition(),
  ): Promise<ConfiguredGroup> {
    const plan = await approved(group.nivel_id, structure);
    return (
      await call('post', `evaluacion/grupos/${group.id}/configuracion`)
        .send({ planId: plan.id, confirmado: true })
        .expect(201)
    ).body as ConfiguredGroup;
  }
  async function dataset(structure = definition()) {
    const group = await fixture.group();
    const configured = await configure(group, structure);
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    return {
      group,
      configured,
      student,
      enrollment,
      indicators: configured.evaluaciones.flatMap((e) => e.indicadores),
    };
  }
  async function persisted(group: AttendanceFixtureGroup) {
    const [grades, results, enrollments, audit] = await Promise.all([
      source.query(
        'SELECT * FROM calificaciones WHERE grupo_id=$1 ORDER BY id',
        [group.id],
      ),
      source.query(
        'SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1 ORDER BY r.id',
        [group.id],
      ),
      source.query('SELECT * FROM matriculas WHERE grupo_id=$1 ORDER BY id', [
        group.id,
      ]),
      source.query(
        "SELECT a.* FROM auditoria_eventos a JOIN calificaciones c ON a.entidad='calificaciones' AND a.entidad_id=c.id::text WHERE c.grupo_id=$1 ORDER BY a.id",
        [group.id],
      ),
    ]);
    return { grades, results, enrollments, audit };
  }
  const gradesPath = (group: AttendanceFixtureGroup) =>
    `evaluacion/grupos/${group.id}/calificaciones`;
  async function matrix(group: AttendanceFixtureGroup, actor = teacher) {
    return (await call('get', gradesPath(group), actor).expect(200))
      .body as Matrix;
  }
  const cell = (
    enrollment: AttendanceFixtureEnrollment,
    indicator: { id: string },
    nota = '12.50',
    version: number | null = null,
  ): Cell => ({
    matriculaId: enrollment.id,
    indicadorId: indicator.id,
    nota,
    version,
  });
  function save(
    group: AttendanceFixtureGroup,
    registros: unknown[],
    actor = teacher,
  ) {
    return call('patch', gradesPath(group), actor).send({ registros });
  }
  async function complete(
    data: Awaited<ReturnType<typeof dataset>>,
    nota = '12.50',
  ) {
    return (
      await save(
        data.group,
        data.indicators.map((indicator) =>
          cell(data.enrollment, indicator, nota),
        ),
      ).expect(200)
    ).body as Saved;
  }
  function historyPath(
    group: AttendanceFixtureGroup,
    enrollment: AttendanceFixtureEnrollment,
    indicator: { id: string },
  ) {
    return `${gradesPath(group)}/${enrollment.id}/indicadores/${indicator.id}/historial`;
  }
  async function history(
    data: Awaited<ReturnType<typeof dataset>>,
    indicator = data.indicators[0]!,
    actor = teacher,
  ) {
    return (
      await call(
        'get',
        historyPath(data.group, data.enrollment, indicator),
        actor,
      ).expect(200)
    ).body as History;
  }
  async function actClosure(group: AttendanceFixtureGroup) {
    await insertHistoricalAct(source, group.id, adminId);
  }
  async function result(
    enrollment: AttendanceFixtureEnrollment,
    confirmed = true,
  ) {
    await source.query(
      `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at)
       VALUES($1,16,16,0,0,0,'APROBADO',${confirmed ? 'now()' : 'NULL'})`,
      [enrollment.id],
    );
  }

  it.each(['12.4', '12.5', '0', '20'])(
    'guarda %s, calcula exactamente y distingue promedio de la nota oficial',
    async (nota) => {
      const data = await dataset();
      const before = await persisted(data.group);
      const saved = await complete(data, nota);
      expect(saved.items).toHaveLength(4);
      expect(
        saved.items.every((grade) => grade.nota === Number(nota).toFixed(2)),
      ).toBe(true);
      expect(saved.items.every((grade) => grade.version === 1)).toBe(true);
      expect(saved.resumenes).toEqual([
        {
          matriculaId: data.enrollment.id,
          resumenNotas: {
            configuracionAprobada: true,
            promedio: Number(nota).toFixed(2),
            notaOficial:
              nota === '12.4' ? 12 : nota === '12.5' ? 13 : Number(nota),
            calificacionesEsperadas: 4,
            calificacionesRegistradas: 4,
            calificacionesPendientes: 0,
            motivoPendiente: null,
          },
        },
      ]);
      const viewed = await matrix(data.group);
      expect(viewed.items[0]!.resumenNotas).toEqual(
        saved.resumenes[0]!.resumenNotas,
      );
      expect(viewed.preparacionActa).toMatchObject({
        calificacionesPendientes: 0,
        puedeCerrar: true,
      });
      const after = await persisted(data.group);
      expect(after.results).toEqual(before.results);
      expect(after.enrollments).toEqual(before.enrollments);
      expect(after.audit).toHaveLength(4);
    },
  );

  it('no redondea evaluaciones ni promedio intermedio antes de obtener la nota oficial', async () => {
    const data = await dataset(definition(['100'], ['50', '50']));
    const saved = (
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!, '12.49'),
        cell(data.enrollment, data.indicators[1]!, '12.50'),
      ]).expect(200)
    ).body as Saved;
    expect(saved.resumenes[0]!.resumenNotas).toMatchObject({
      promedio: '12.495',
      notaOficial: 12,
      calificacionesPendientes: 0,
    });
    const uneven = await dataset(
      definition(['33.33', '66.67'], ['33.33', '66.67']),
    );
    const exact = (
      await save(uneven.group, [
        cell(uneven.enrollment, uneven.indicators[0]!, '12.49'),
        cell(uneven.enrollment, uneven.indicators[1]!, '12.50'),
        cell(uneven.enrollment, uneven.indicators[2]!, '12.50'),
        cell(uneven.enrollment, uneven.indicators[3]!, '12.50'),
      ]).expect(200)
    ).body as Saved;
    expect(exact.resumenes[0]!.resumenNotas).toMatchObject({
      promedio: '12.4988891111',
      notaOficial: 12,
    });
  });

  it('una nota cero registrada no sustituye las tres celdas pendientes', async () => {
    const data = await dataset();
    const pending = await matrix(data.group);
    expect(pending.items[0]!.calificaciones).toEqual([]);
    expect(pending.items[0]!.resumenNotas).toMatchObject({
      promedio: null,
      notaOficial: null,
      calificacionesRegistradas: 0,
      calificacionesPendientes: 4,
    });
    expect((await history(data)).calificacion).toBeNull();
    const saved = (
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!, '0'),
      ]).expect(200)
    ).body as Saved;
    expect(saved.items[0]!.nota).toBe('0.00');
    expect(saved.resumenes[0]!.resumenNotas).toMatchObject({
      promedio: null,
      notaOficial: null,
      calificacionesRegistradas: 1,
      calificacionesPendientes: 3,
    });
    expect(saved.resumenes[0]!.resumenNotas.motivoPendiente).toBeTruthy();
    expect(saved.preparacionActa.puedeCerrar).toBe(false);
  });

  it('la corrección abierta conserva origen, incrementa versión y audita antes y después', async () => {
    const data = await dataset(definition(['100'], ['100']));
    const original = (await complete(data, '12.4')).items[0]!;
    const secondTeacher = await login('docente2');
    const updated = (
      await save(
        data.group,
        [cell(data.enrollment, data.indicators[0]!, '12.5', original.version)],
        secondTeacher,
      ).expect(200)
    ).body as Saved;
    expect(updated.items[0]).toMatchObject({
      id: original.id,
      registrado_por: fixture.userIds.docente,
      registrado_at: original.registrado_at,
      nota: '12.50',
      version: 2,
    });
    expect(updated.items[0]!.actualizado_at).toBeTruthy();
    expect(updated.resumenes[0]!.resumenNotas.notaOficial).toBe(13);
    const viewed = await history(data);
    expect(viewed.items).toHaveLength(2);
    expect(viewed.items.map((event) => event.accion)).toEqual([
      'CREATE_GRADE',
      'UPDATE_GRADE',
    ]);
    expect(viewed.items[0]).toMatchObject({
      usuario_id: fixture.userIds.docente,
      valor_anterior: null,
      valor_nuevo: { nota: '12.40', version: 1 },
    });
    expect(viewed.items[1]).toMatchObject({
      usuario_id: fixture.userIds.docente2,
      valor_anterior: { nota: '12.40', version: 1 },
      valor_nuevo: { nota: '12.50', version: 2 },
    });
    expect(
      viewed.items.every((event) => event.ocurrido_at && event.nombre_usuario),
    ).toBe(true);
    expect(JSON.stringify(viewed)).not.toMatch(
      /ip_origen|password_hash|csrf|sessionId/,
    );
  });

  it('una nota idéntica normalizada no inventa corrección, pero su versión debe estar vigente', async () => {
    const data = await dataset(definition(['100'], ['100']));
    const original = (await complete(data, '12.5')).items[0]!;
    const before = await persisted(data.group);
    const repeated = (
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!, '12.50', original.version),
      ]).expect(200)
    ).body as Saved;
    expect(repeated.items[0]).toEqual(original);
    expect(await persisted(data.group)).toEqual(before);
    await save(data.group, [
      cell(data.enrollment, data.indicators[0]!, '12.50', null),
    ]).expect(409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each(['ADMIN', 'SECRETARIA', 'COORDINADOR'])(
    '%s consulta la matriz e historial, pero no registra notas sin ser docente asignado',
    async (role) => {
      const data = await dataset();
      const actor = role === 'ADMIN' ? admin : await login(role.toLowerCase());
      expect((await matrix(data.group, actor)).puedeEditar).toBe(false);
      await call(
        'get',
        historyPath(data.group, data.enrollment, data.indicators[0]!),
        actor,
      ).expect(200);
      await save(
        data.group,
        [cell(data.enrollment, data.indicators[0]!)],
        actor,
      ).expect(403);
      expect((await persisted(data.group)).grades).toHaveLength(0);
    },
  );

  it('DOCENTE y ADMIN combinado solo puede escribir cuando está asignado al grupo', async () => {
    const data = await dataset();
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='ADMIN'",
      [fixture.userIds.docente, adminId],
    );
    try {
      await save(
        data.group,
        [cell(data.enrollment, data.indicators[0]!)],
        teacher,
      ).expect(200);
      await source.query(
        'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
        [data.group.id, fixture.teacherId],
      );
      const snapshot = await persisted(data.group);
      expect((await matrix(data.group, teacher)).puedeEditar).toBe(false);
      await save(
        data.group,
        [cell(data.enrollment, data.indicators[1]!)],
        teacher,
      ).expect(403);
      expect(await persisted(data.group)).toEqual(snapshot);
    } finally {
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='ADMIN')",
        [fixture.userIds.docente],
      );
    }
  });

  it('docente ajeno no consulta ni modifica notas o historial de un grupo sin asignación', async () => {
    const data = await dataset();
    const foreignTeacher = await login('ajeno');
    await call('get', gradesPath(data.group), foreignTeacher).expect(403);
    await call(
      'get',
      historyPath(data.group, data.enrollment, data.indicators[0]!),
      foreignTeacher,
    ).expect(403);
    await save(
      data.group,
      [cell(data.enrollment, data.indicators[0]!)],
      foreignTeacher,
    ).expect(403);
    const unassigned = await fixture.group(false);
    await configure(unassigned);
    const foreignEnrollment = await fixture.enroll(
      unassigned,
      await fixture.student(),
    );
    await call('get', gradesPath(unassigned), teacher).expect(403);
    await save(
      unassigned,
      [{ ...cell(foreignEnrollment, data.indicators[0]!) }],
      teacher,
    ).expect(403);
  });

  it('protege sesiones y CSRF antes de modificar una nota', async () => {
    const data = await dataset();
    const body = { registros: [cell(data.enrollment, data.indicators[0]!)] };
    await request(app.getHttpServer())
      .get(`/api/v1/${gradesPath(data.group)}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/${gradesPath(data.group)}`)
      .set('Origin', origin)
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/${gradesPath(data.group)}`)
      .set('Origin', origin)
      .set('Cookie', teacher.cookie)
      .set('X-Requested-With', 'Excel-Web')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/${gradesPath(data.group)}`)
      .set('Origin', 'http://origen-ajeno.invalid')
      .set('Cookie', teacher.cookie)
      .set('X-CSRF-Token', teacher.csrf)
      .set('X-Requested-With', 'Excel-Web')
      .send(body)
      .expect(403);
    const revoked = await login('docente');
    await call('post', 'auth/logout', revoked).send({}).expect(204);
    await save(data.group, body.registros, revoked).expect(401);
    expect((await persisted(data.group)).grades).toHaveLength(0);
  });

  it('revalida asignación, perfil y persona activos con la misma sesión ya emitida', async () => {
    const data = await dataset();
    for (const [table, id, restore] of [
      ['grupo_docentes', data.group.id, 'grupo_id'],
      ['docentes', fixture.teacherId, 'id'],
      ['personas', fixture.teacherPersonId, 'id'],
    ] as const) {
      const predicate =
        table === 'grupo_docentes'
          ? `${restore}=$1 AND docente_id=${fixture.teacherId}`
          : `${restore}=$1`;
      await source.query(
        `UPDATE ${table} SET activo=false WHERE ${predicate}`,
        [id],
      );
      try {
        await save(
          data.group,
          [cell(data.enrollment, data.indicators[0]!)],
          teacher,
        ).expect(403);
      } finally {
        await source.query(
          `UPDATE ${table} SET activo=true WHERE ${predicate}`,
          [id],
        );
      }
    }
    expect((await persisted(data.group)).grades).toHaveLength(0);
    await save(
      data.group,
      [cell(data.enrollment, data.indicators[0]!)],
      teacher,
    ).expect(200);
  });

  it('revalida el rol dentro de la transacción aunque el guard HTTP ya lo hubiera leído', async () => {
    const data = await dataset();
    // El bloqueo compartido de administración deja la petición esperando después del guard.
    const runner = source.createQueryRunner();
    let response: Promise<request.Response> | undefined;
    try {
      await runner.startTransaction();
      await runner.query('SELECT pg_advisory_xact_lock(20260924,4)');
      response = save(
        data.group,
        [cell(data.enrollment, data.indicators[0]!)],
        teacher,
      ).then((r) => r);
      for (let tries = 0; tries < 100; tries++) {
        const [waiting] = await source.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND pid<>pg_backend_pid()) AS found",
        );
        if (waiting.found) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (tries === 99)
          throw new Error('La petición no llegó al bloqueo de autorización');
      }
      await runner.query(
        "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
        [fixture.userIds.docente, adminId],
      );
      await runner.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='DOCENTE')",
        [fixture.userIds.docente],
      );
      await runner.commitTransaction();
      expect((await response).status).toBe(403);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await source.query(
        "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='DOCENTE' ON CONFLICT DO NOTHING",
        [fixture.userIds.docente, adminId],
      );
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='SECRETARIA')",
        [fixture.userIds.docente],
      );
      if (response) await response;
    }
    expect((await persisted(data.group)).grades).toHaveLength(0);
  });

  it.each([
    '-1',
    '20.01',
    '21',
    '12.345',
    '1e1',
    'NaN',
    '12,5',
    '',
    ' 12.5',
    '12.5 ',
  ])(
    'rechaza la nota inválida %j sin auditoría ni registro parcial',
    async (nota) => {
      const data = await dataset();
      const snapshot = await persisted(data.group);
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!, nota),
      ]).expect(400);
      expect(await persisted(data.group)).toEqual(snapshot);
    },
  );

  it('DTO estricto rechaza nota null/numérica, versión ausente o inválida, IDs y campos extra', async () => {
    const data = await dataset();
    const valid = cell(data.enrollment, data.indicators[0]!);
    const { version: _version, ...withoutVersion } = valid;
    for (const invalid of [
      { ...valid, nota: null },
      { ...valid, nota: 12.5 },
      { ...valid, nota: true },
      withoutVersion,
      { ...valid, version: 0 },
      { ...valid, version: -1 },
      { ...valid, version: '1' },
      { ...valid, version: 1.5 },
      { ...valid, matriculaId: '0' },
      { ...valid, indicadorId: 1 },
      { ...valid, estudianteId: data.student.id },
      { ...valid, registrado_por: adminId },
    ])
      await save(data.group, [invalid]).expect(400);
    await call('patch', gradesPath(data.group), teacher)
      .send({ registros: [valid], confirmado: true })
      .expect(400);
    await save(data.group, []).expect(400);
    await save(
      data.group,
      Array.from({ length: 2001 }, () => valid),
    ).expect(400);
    expect((await persisted(data.group)).grades).toHaveLength(0);
  });

  it('un par de matrícula e indicador no puede repetirse en el mismo lote', async () => {
    const data = await dataset();
    const valid = cell(data.enrollment, data.indicators[0]!);
    await save(data.group, [valid, { ...valid, nota: '15' }]).expect(400);
    expect((await persisted(data.group)).grades).toHaveLength(0);
  });

  it('registra el límite de 2000 celdas válidas sin truncar un cuerpo de más de 100 KB', async () => {
    const weights = Array.from({ length: 20 }, () => '5');
    const data = await dataset(
      definition(weights, ['20', '20', '20', '20', '20']),
    );
    const enrollments = [data.enrollment];
    for (let index = 1; index < 20; index++)
      enrollments.push(
        await fixture.enroll(data.group, await fixture.student()),
      );
    const cells = enrollments.flatMap((enrollment) =>
      data.indicators.map((indicator) => cell(enrollment, indicator, '12.50')),
    );
    expect(cells).toHaveLength(2000);
    expect(
      Buffer.byteLength(JSON.stringify({ registros: cells })),
    ).toBeGreaterThan(100 * 1024);
    const saved = (await save(data.group, cells).expect(200)).body as Saved;
    expect(saved.items).toHaveLength(2000);
    expect(saved.resumenes).toHaveLength(20);
    expect(
      saved.resumenes.every(
        ({ resumenNotas }) =>
          resumenNotas.notaOficial === 13 &&
          resumenNotas.calificacionesPendientes === 0,
      ),
    ).toBe(true);
    const before = await persisted(data.group);
    await save(data.group, [...cells, cells[0]!]).expect(400);
    expect(await persisted(data.group)).toEqual(before);
  }, 60000);

  it('rechaza cuerpos mayores de 512 KB con respuesta uniforme sin aplicar sus notas', async () => {
    const data = await dataset();
    const before = await persisted(data.group);
    const response = await call('patch', gradesPath(data.group), teacher)
      .send({
        registros: [cell(data.enrollment, data.indicators[0]!)],
        excedenteSintetico: 'z'.repeat(512 * 1024),
      })
      .expect(413);
    expect(response.body).toEqual({
      statusCode: 413,
      message: 'La solicitud supera el tamaño máximo permitido',
    });
    expect(await persisted(data.group)).toEqual(before);
  });

  it('JSON malformado devuelve 400 sin filtrar el contenido ni registrar celdas', async () => {
    const data = await dataset();
    const before = await persisted(data.group);
    const response = await call('patch', gradesPath(data.group), teacher)
      .set('Content-Type', 'application/json')
      .send('{"registros":[{"nota":"contenido-sintetico-confidencial"}')
      .expect(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: 'El cuerpo JSON no es válido',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'contenido-sintetico-confidencial',
    );
    expect(await persisted(data.group)).toEqual(before);
  });

  it('rechaza cruces de grupo, referencias inexistentes y conserva celdas válidas del lote', async () => {
    const data = await dataset();
    const foreign = await dataset();
    for (const invalid of [
      cell(foreign.enrollment, data.indicators[1]!),
      cell(data.enrollment, foreign.indicators[0]!),
      {
        ...cell(data.enrollment, data.indicators[1]!),
        matriculaId: '999999999999999999',
      },
      {
        ...cell(data.enrollment, data.indicators[1]!),
        indicadorId: '999999999999999999',
      },
    ]) {
      const snapshot = await persisted(data.group);
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!),
        invalid,
      ]).expect(404);
      expect(await persisted(data.group)).toEqual(snapshot);
    }
    await call(
      'get',
      historyPath(data.group, foreign.enrollment, data.indicators[0]!),
    ).expect(404);
    await call(
      'get',
      historyPath(data.group, data.enrollment, foreign.indicators[0]!),
    ).expect(404);
    await call(
      'get',
      'evaluacion/grupos/999999999999999999/calificaciones',
    ).expect(404);
    await call('get', 'evaluacion/grupos/0/calificaciones').expect(400);
  });

  it.each(['PENDIENTE', 'ANULADA', 'CERRADA'] as const)(
    'la matrícula %s no admite nuevas notas y sigue diferenciada de las activas',
    async (state) => {
      const data = await dataset();
      const other = await fixture.enroll(
        data.group,
        await fixture.student(),
        state,
      );
      const snapshot = await persisted(data.group);
      await save(data.group, [
        cell(data.enrollment, data.indicators[0]!),
        cell(other, data.indicators[1]!),
      ]).expect(409);
      expect(await persisted(data.group)).toEqual(snapshot);
      const rows = (await matrix(data.group)).items;
      if (state === 'CERRADA')
        expect(
          rows.find((row) => row.matricula_id === other.id)?.editable,
        ).toBe(false);
      else
        expect(rows.some((row) => row.matricula_id === other.id)).toBe(false);
    },
  );

  it('sin configuración aprobada aplicada no calcula un promedio ni ofrece escritura de notas', async () => {
    const group = await fixture.group();
    await fixture.enroll(group, await fixture.student());
    const viewed = await matrix(group);
    expect(viewed.configuracion).toBeNull();
    expect(viewed.plan).toBeNull();
    expect(viewed.puedeEditar).toBe(false);
    expect(viewed.items[0]!.resumenNotas).toMatchObject({
      configuracionAprobada: false,
      promedio: null,
      notaOficial: null,
    });
    await save(group, [
      {
        matriculaId: viewed.items[0]!.matricula_id,
        indicadorId: '1',
        nota: '15',
        version: null,
      },
    ]).expect(409);
  });

  it('notas legacy se conservan en consulta e historial sin atribuirles criterios aprobados', async () => {
    const group = await fixture.group();
    const enrollment = await fixture.enroll(group, await fixture.student());
    const [evaluation] = await source.query(
      "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden) VALUES($1,'Legacy lectura B17',100,1) RETURNING id",
      [group.id],
    );
    const [indicator] = await source.query(
      "INSERT INTO indicadores_evaluacion(grupo_id,evaluacion_id,codigo,descripcion,peso_pct,orden) VALUES($1,$2,'LEG','Legacy lectura sintética',100,1) RETURNING id",
      [group.id, evaluation.id],
    );
    await insertHistoricalGrade(source, {
      matriculaId: enrollment.id,
      indicadorId: indicator.id,
      grupoId: group.id,
      nota: '14.50',
      registradoPor: adminId,
    });
    const before = await persisted(group);
    const viewed = await matrix(group);
    expect(viewed.puedeEditar).toBe(false);
    expect(viewed.items[0]!.calificaciones[0]).toMatchObject({
      nota: '14.50',
      version: 1,
    });
    expect(viewed.items[0]!.resumenNotas).toMatchObject({
      configuracionAprobada: false,
      promedio: null,
      notaOficial: null,
    });
    await call(
      'get',
      historyPath(group, enrollment, indicator),
      teacher,
    ).expect(200);
    await save(group, [cell(enrollment, indicator, '20', 1)]).expect(409);
    expect(await persisted(group)).toEqual(before);
  });

  it.each([
    'grupo cerrado',
    'periodo cerrado',
    'grupo planificado',
    'periodo planificado',
    'acta cerrada',
  ])(
    '%s conserva notas e historial pero bloquea registro y actualización ordinarios',
    async (state) => {
      const data = await dataset();
      const saved = await complete(data);
      if (state === 'acta cerrada') await actClosure(data.group);
      else if (state.startsWith('grupo'))
        await source.query('UPDATE grupos SET estado=$2 WHERE id=$1', [
          data.group.id,
          state.endsWith('cerrado') ? 'CERRADO' : 'PLANIFICADO',
        ]);
      else
        await source.query(
          'UPDATE periodos_academicos SET estado=$2 WHERE id=$1',
          [
            data.group.periodo_id,
            state.endsWith('cerrado') ? 'CERRADO' : 'PLANIFICADO',
          ],
        );
      const snapshot = await persisted(data.group);
      const viewed = await matrix(data.group);
      expect(viewed.puedeEditar).toBe(false);
      expect(viewed.items[0]!.calificaciones).toHaveLength(4);
      expect((await history(data)).items).toHaveLength(1);
      if (state === 'acta cerrada') expect(viewed.acta.cerrada).toBe(true);
      await save(data.group, [
        cell(
          data.enrollment,
          data.indicators[0]!,
          '15',
          saved.items[0]!.version,
        ),
      ]).expect(409);
      expect(await persisted(data.group)).toEqual(snapshot);
    },
  );

  it('el cierre de asistencia permite registrar y corregir las calificaciones con acta abierta', async () => {
    const data = await dataset();
    await source.query(
      "INSERT INTO cierres_academicos(grupo_id,tipo,estado,realizado_por,revision,resumen) VALUES($1,'ASISTENCIA','CERRADO',$2,$3,'{}'::jsonb)",
      [data.group.id, adminId, 'a'.repeat(64)],
    );
    expect((await matrix(data.group)).puedeEditar).toBe(true);
    const saved = await complete(data);
    const updated = (
      await save(data.group, [
        cell(
          data.enrollment,
          data.indicators[0]!,
          '20',
          saved.items[0]!.version,
        ),
      ]).expect(200)
    ).body as Saved;
    expect(updated.items[0]).toMatchObject({ nota: '20.00', version: 2 });
    expect((await persisted(data.group)).results).toHaveLength(0);
  });

  it.each([true, false])(
    'no modifica un intento con resultado histórico (confirmado=%s)',
    async (confirmed) => {
      const data = await dataset();
      const saved = await complete(data);
      await result(data.enrollment, confirmed);
      const snapshot = await persisted(data.group);
      expect((await matrix(data.group)).items[0]!.editable).toBe(false);
      await save(data.group, [
        cell(
          data.enrollment,
          data.indicators[0]!,
          '20',
          saved.items[0]!.version,
        ),
      ]).expect(409);
      expect(await persisted(data.group)).toEqual(snapshot);
    },
  );

  it('la paginación conserva el resumen completo de cada intento y excluye solicitudes', async () => {
    const data = await dataset(definition(['100'], ['100']));
    const second = await fixture.enroll(data.group, await fixture.student());
    const closed = await fixture.enroll(
      data.group,
      await fixture.student(),
      'CERRADA',
    );
    await fixture.enroll(data.group, await fixture.student(), 'PENDIENTE');
    await fixture.enroll(data.group, await fixture.student(), 'ANULADA');
    await complete(data);
    await save(data.group, [cell(second, data.indicators[0]!, '15')]).expect(
      200,
    );
    const firstPage = (
      await call('get', `${gradesPath(data.group)}?limit=1`, teacher).expect(
        200,
      )
    ).body as Matrix;
    expect(firstPage.items.map((row) => row.matricula_id)).toEqual([
      data.enrollment.id,
    ]);
    expect(firstPage.nextCursor).toBe(data.enrollment.id);
    expect(firstPage.items[0]!.resumenNotas.notaOficial).toBe(13);
    const secondPage = (
      await call(
        'get',
        `${gradesPath(data.group)}?limit=1&after=${firstPage.nextCursor}`,
        teacher,
      ).expect(200)
    ).body as Matrix;
    expect(secondPage.items.map((row) => row.matricula_id)).toEqual([
      second.id,
    ]);
    expect(secondPage.items[0]!.resumenNotas.notaOficial).toBe(15);
    const finalPage = (
      await call(
        'get',
        `${gradesPath(data.group)}?limit=1&after=${secondPage.nextCursor}`,
        teacher,
      ).expect(200)
    ).body as Matrix;
    expect(finalPage.items.map((row) => row.matricula_id)).toEqual([closed.id]);
    expect(finalPage.nextCursor).toBeNull();
    expect(finalPage.items[0]!.resumenNotas.promedio).toBeNull();
    expect(firstPage.preparacionActa).toEqual(finalPage.preparacionActa);
    expect(firstPage.preparacionActa.calificacionesPendientes).toBe(1);
    for (const query of [
      'limit=0',
      'limit=101',
      'after=-1',
      'limit=1.5',
      'estudianteId=1',
    ])
      await call('get', `${gradesPath(data.group)}?${query}`, teacher).expect(
        400,
      );
  });

  it('otro intento del mismo nivel y nuevas versiones de pesos conservan el intento anterior', async () => {
    const first = await dataset();
    await complete(first, '10');
    await source.query("UPDATE matriculas SET estado='CERRADA' WHERE id=$1", [
      first.enrollment.id,
    ]);
    const before = await persisted(first.group);
    const secondGroup = await fixture.group();
    const secondConfiguration = await configure(
      secondGroup,
      definition(['100'], ['100']),
    );
    const secondEnrollment = await fixture.enroll(secondGroup, first.student);
    expect(secondEnrollment.numero_intento).toBe(
      first.enrollment.numero_intento + 1,
    );
    await save(secondGroup, [
      cell(
        secondEnrollment,
        secondConfiguration.evaluaciones[0]!.indicadores[0]!,
        '18',
      ),
    ]).expect(200);
    expect(await persisted(first.group)).toEqual(before);
    expect((await matrix(first.group)).items[0]!.resumenNotas.notaOficial).toBe(
      10,
    );
    expect((await matrix(secondGroup)).items[0]!.resumenNotas.notaOficial).toBe(
      18,
    );
    expect((await matrix(first.group)).configuracion!.plan_id).toBe(
      first.configured.configuracion.plan_id,
    );
  });

  it('una celda obsoleta revierte otras creaciones y correcciones del lote', async () => {
    const data = await dataset();
    const saved = (
      await save(data.group, [
        cell(data.enrollment, data.indicators[1]!, '10'),
      ]).expect(200)
    ).body as Saved;
    const old = saved.items[0]!;
    await save(data.group, [
      cell(data.enrollment, data.indicators[1]!, '12', old.version),
    ]).expect(200);
    const before = await persisted(data.group);
    await save(data.group, [
      cell(data.enrollment, data.indicators[0]!, '20'),
      cell(data.enrollment, data.indicators[1]!, '15', old.version),
    ]).expect(409);
    expect(await persisted(data.group)).toEqual(before);
    await save(data.group, [
      cell(data.enrollment, data.indicators[1]!, '15', null),
    ]).expect(409);
    await save(data.group, [
      cell(data.enrollment, data.indicators[2]!, '15', 1),
    ]).expect(409);
    expect(await persisted(data.group)).toEqual(before);
  });

  it.each(['creación', 'corrección'])(
    'dos docentes concurrentes sobre la misma celda permiten solo una %s',
    async (mode) => {
      const data = await dataset(definition(['100'], ['100']));
      const original =
        mode === 'corrección' ? (await complete(data)).items[0]! : null;
      const actor2 = await login('docente2');
      const responses = await Promise.all([
        save(
          data.group,
          [
            cell(
              data.enrollment,
              data.indicators[0]!,
              '14',
              original?.version ?? null,
            ),
          ],
          teacher,
        ),
        save(
          data.group,
          [
            cell(
              data.enrollment,
              data.indicators[0]!,
              '16',
              original?.version ?? null,
            ),
          ],
          actor2,
        ),
      ]);
      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const snapshot = await persisted(data.group);
      expect(snapshot.grades).toHaveLength(1);
      expect(snapshot.grades[0].version).toBe(mode === 'creación' ? 1 : 2);
      expect(snapshot.audit).toHaveLength(mode === 'creación' ? 1 : 2);
      expect((await history(data)).items).toHaveLength(
        mode === 'creación' ? 1 : 2,
      );
    },
  );

  it.each(['auditoría', 'cálculo'])(
    'fallo de %s revierte el lote completo y permite reintento',
    async (mode) => {
      const data = await dataset();
      const before = await persisted(data.group);
      if (mode === 'auditoría')
        vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
          new Error('Fallo sintético B17 de auditoría'),
        );
      else
        vi.spyOn(
          app.get(GradeCalculationService),
          'summaries',
        ).mockRejectedValueOnce(new Error('Fallo sintético B17 de cálculo'));
      await save(
        data.group,
        data.indicators.map((indicator) => cell(data.enrollment, indicator)),
      ).expect(500);
      expect(await persisted(data.group)).toEqual(before);
      vi.restoreAllMocks();
      await complete(data);
    },
  );

  it('SQL protege escala, versión, identidad, origen y conservación del historial', async () => {
    const data = await dataset(definition(['100'], ['100']));
    const saved = (await complete(data)).items[0]!;
    const before = await persisted(data.group);
    for (const query of [
      'UPDATE calificaciones SET nota=-1,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET nota=21,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET nota=12.345,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET nota=NULL,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET nota=15 WHERE id=$1',
      'UPDATE calificaciones SET version=version+2,nota=15 WHERE id=$1',
      'UPDATE calificaciones SET registrado_por=registrado_por+1,version=version+1 WHERE id=$1',
      "UPDATE calificaciones SET registrado_at=registrado_at-interval '1 day',version=version+1 WHERE id=$1",
      'UPDATE calificaciones SET grupo_id=grupo_id+1,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET indicador_id=indicador_id+1,version=version+1 WHERE id=$1',
      'UPDATE calificaciones SET matricula_id=matricula_id+1,version=version+1 WHERE id=$1',
      'DELETE FROM calificaciones WHERE id=$1',
    ])
      await expect(source.query(query, [saved.id])).rejects.toBeDefined();
    await expect(
      source.query('TRUNCATE calificaciones CASCADE'),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    expect(await persisted(data.group)).toEqual(before);
    await source.query(
      'UPDATE calificaciones SET nota=15,version=version+1 WHERE id=$1',
      [saved.id],
    );
    const viewed = await matrix(data.group);
    expect(viewed.items[0]!.resumenNotas.notaOficial).toBe(15);
    expect(viewed.items[0]!.calificaciones[0]!.nota).toBe('15.00');
    const sqlSnapshot = await persisted(data.group);
    await save(data.group, [
      cell(data.enrollment, data.indicators[0]!, '15', 2),
    ]).expect(200);
    expect(await persisted(data.group)).toEqual(sqlSnapshot);
    await source.query(
      'UPDATE calificaciones SET nota=0,version=version+1 WHERE id=$1',
      [saved.id],
    );
    const zero = await matrix(data.group);
    expect(zero.items[0]!.calificaciones[0]!.nota).toBe('0.00');
    expect(zero.items[0]!.resumenNotas.notaOficial).toBe(0);
    const zeroSnapshot = await persisted(data.group);
    await save(data.group, [
      cell(data.enrollment, data.indicators[0]!, '0', 3),
    ]).expect(200);
    expect(await persisted(data.group)).toEqual(zeroSnapshot);
  });

  it('un snapshot SQL anterior a un cierre ACTA o resultado no escribe notas después de su registro', async () => {
    for (const kind of ['acta', 'resultado']) {
      const data = await dataset();
      const runner = source.createQueryRunner();
      try {
        await runner.startTransaction('REPEATABLE READ');
        await runner.query('SELECT id FROM grupos WHERE id=$1', [
          data.group.id,
        ]);
        if (kind === 'acta') await actClosure(data.group);
        else await result(data.enrollment);
        await expect(
          runner.query(
            'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,15,$4)',
            [
              data.enrollment.id,
              data.indicators[0]!.id,
              data.group.id,
              fixture.userIds.docente,
            ],
          ),
        ).rejects.toMatchObject({ driverError: { code: '40001' } });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      expect((await persisted(data.group)).grades).toHaveLength(0);
    }
  });

  it('SQL bloquea criterios sin aprobación, intentos no activos y registros cerrados', async () => {
    const data = await dataset();
    const legacyGroup = await fixture.group();
    const legacyEnrollment = await fixture.enroll(
      legacyGroup,
      await fixture.student(),
    );
    const [evaluation] = await source.query(
      "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden) VALUES($1,'Legacy sintético B17',100,1) RETURNING id",
      [legacyGroup.id],
    );
    const [indicator] = await source.query(
      "INSERT INTO indicadores_evaluacion(grupo_id,evaluacion_id,codigo,descripcion,peso_pct,orden) VALUES($1,$2,'LEG','Legacy sintético',100,1) RETURNING id",
      [legacyGroup.id, evaluation.id],
    );
    const insert = (
      group: AttendanceFixtureGroup,
      enrollment: AttendanceFixtureEnrollment,
      indicatorId: string,
      version = 1,
    ) =>
      source.query(
        'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por,version) VALUES($1,$2,$3,15,$4,$5)',
        [
          enrollment.id,
          indicatorId,
          group.id,
          fixture.userIds.docente,
          version,
        ],
      );
    await expect(
      insert(legacyGroup, legacyEnrollment, indicator.id),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      insert(data.group, data.enrollment, data.indicators[0]!.id, 2),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const inactive = await fixture.enroll(
      data.group,
      await fixture.student(),
      'CERRADA',
    );
    await expect(
      insert(data.group, inactive, data.indicators[0]!.id),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await actClosure(data.group);
    await expect(
      insert(data.group, data.enrollment, data.indicators[0]!.id),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const historic = await dataset();
    await result(historic.enrollment);
    await expect(
      insert(historic.group, historic.enrollment, historic.indicators[0]!.id),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect((await persisted(data.group)).grades).toHaveLength(0);
  });

  it('la reversión de B17 no pierde calificaciones persistidas', async () => {
    const data = await dataset();
    await complete(data);
    const before = await persisted(data.group);
    await expect(
      checkMigrationReversal(source, new CalificacionesAbiertas1790208013000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await persisted(data.group)).toEqual(before);
  });

  it('OpenAPI conserva matriz, lote, versiones y cálculo al añadir el acta B18', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const base = '/api/v1/evaluacion/grupos/{grupoId}/calificaciones';
    expect(spec.paths[base].get).toBeDefined();
    expect(spec.paths[base].patch).toBeDefined();
    expect(
      spec.paths[`${base}/{matriculaId}/indicadores/{indicadorId}/historial`]
        .get,
    ).toBeDefined();
    expect(JSON.stringify(spec.paths[base])).toContain('resumenNotas');
    expect(JSON.stringify(spec)).toContain('notaOficial');
    expect(JSON.stringify(spec.paths[base].patch)).toContain('version');
    expect(
      Object.keys(spec.paths).some(
        (path) =>
          path.startsWith('/api/v1/evaluacion') && /reapertura|xlsx/.test(path),
      ),
    ).toBe(false);
  });
});
