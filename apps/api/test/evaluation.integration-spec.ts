import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { EvaluationService } from '../src/modules/evaluacion/evaluation.service.js';
import { EvaluationRepository } from '../src/modules/evaluacion/evaluation.repository.js';
import { PlanesEvaluacion1790208012000 } from '../src/database/migraciones/1790208012000-planes-evaluacion.js';
import { checkMigrationReversal } from './migration-test.js';
import { freePort } from './browser-server.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureGroup,
} from './attendance.fixture.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B16 con pnpm test:db');
const password = 'Sintetica-segura-B16';
const formula = 'PONDERADA_JERARQUICA_V1';
type Login = { cookie: string; csrf: string };
type Indicator = {
  codigo: string;
  descripcion: string;
  pesoPct: string;
  orden: number;
};
type Component = {
  nombre: string;
  unidadId: string | null;
  pesoPct: string;
  orden: number;
  indicadores: Indicator[];
};
type Definition = { evaluaciones: Component[] };
type Plan = {
  id: string;
  nivel_id: string;
  version: number;
  revision: number;
  nombre: string;
  formula: string;
  estructura: Definition;
  estado: 'BORRADOR' | 'APROBADO';
  creado_por: string;
  creado_at: string;
  aprobado_por: string | null;
  aprobado_at: string | null;
  referencia_aprobacion: string | null;
};
type PlanView = {
  plan: Plan;
  nivel: { id: string };
  puedeEditar: boolean;
  puedeAprobar: boolean;
  motivoSoloLectura: string | null;
  validacion: {
    completa: boolean;
    pesoTotalPct: string;
    evaluaciones: number;
    indicadores: number;
    errores: string[];
  };
  historial: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
    valor_anterior: Record<string, unknown> | null;
    valor_nuevo: Record<string, unknown>;
  }[];
};
type Config = {
  id: string;
  grupo_id: string;
  nivel_id: string;
  plan_id: string;
  aplicado_por: string;
  aplicado_at: string;
};
type GroupView = {
  grupo: { id: string; asistencia_cerrada: boolean };
  configuracion: Config | null;
  plan: Plan | null;
  planesDisponibles: Plan[];
  puedeAplicar: boolean;
  motivoSoloLectura: string | null;
  evaluaciones: {
    id: string;
    nombre: string;
    peso_pct: string;
    orden: number;
    unidad_id: string | null;
    indicadores: {
      id: string;
      codigo: string;
      descripcion: string;
      peso_pct: string;
      orden: number;
    }[];
  }[];
  preparacionActa: {
    criteriosAprobados: boolean;
    matriculasRevisables: number;
    indicadores: number;
    calificacionesEsperadas: number;
    calificacionesRegistradas: number;
    calificacionesPendientes: number;
    puedeCerrar: boolean;
    motivos: string[];
  };
};

describe('B16 criterios aprobados por nivel, aplicación y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Login;
  let teacher: Login;
  let adminId: string;
  let fixture: AttendanceFixtures;
  let origin: string;
  let englishLevel: string;
  let portugueseLevel: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_evaluation_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_evaluation_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(source, 'admin_b16', password);
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    fixture = await attendanceFixture(source, adminId, password);
    const levels = await source.query(
      "SELECT g.nivel_id,g.codigo FROM grupos g WHERE g.codigo IN ('DEMO-EN-G1','DEMO-PT-G1')",
    );
    englishLevel = levels.find(
      (row: { codigo: string }) => row.codigo === 'DEMO-EN-G1',
    ).nivel_id as string;
    portugueseLevel = levels.find(
      (row: { codigo: string }) => row.codigo === 'DEMO-PT-G1',
    ).nivel_id as string;
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
    admin = await login('admin_b16');
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
  const planPath = (id: string) => `evaluacion/planes/${id}`;
  const levelPath = (id: string) => `evaluacion/niveles/${id}/planes`;
  const groupPath = (g: AttendanceFixtureGroup) =>
    `evaluacion/grupos/${g.id}/configuracion`;
  function definition(
    weights: readonly string[] = ['33.33', '33.33', '33.34'],
    indicatorWeights: readonly string[] = ['100'],
    unitId: string | null = null,
  ): Definition {
    return {
      evaluaciones: weights.map((pesoPct, index) => ({
        nombre: `Evaluación sintética ${index + 1}`,
        unidadId: unitId,
        pesoPct,
        orden: index + 1,
        indicadores: indicatorWeights.map((weight, order) => ({
          codigo: `SYN-${order + 1}`,
          descripcion: `Indicador sintético ${order + 1}`,
          pesoPct: weight,
          orden: order + 1,
        })),
      })),
    };
  }
  async function create(
    level = englishLevel,
    structure = definition(),
    actor = admin,
    patch: Record<string, unknown> = {},
    status = 201,
  ): Promise<PlanView> {
    return (
      await call('post', levelPath(level), actor)
        .send({
          nombre: `Plan sintético B16 ${++sequence}`,
          formula,
          estructura: structure,
          ...patch,
        })
        .expect(status)
    ).body as PlanView;
  }
  function approve(
    plan: Plan,
    actor = admin,
    patch: Record<string, unknown> = {},
  ) {
    return call('post', `${planPath(plan.id)}/aprobacion`, actor).send({
      revision: plan.revision,
      referenciaAprobacion:
        'Referencia sintética B16; no aprobación institucional real',
      confirmado: true,
      ...patch,
    });
  }
  async function approved(
    level = englishLevel,
    structure = definition(),
  ): Promise<Plan> {
    return (await approve((await create(level, structure)).plan).expect(201))
      .body.plan as Plan;
  }
  function update(
    plan: Plan,
    structure = plan.estructura,
    actor = admin,
    patch: Record<string, unknown> = {},
  ) {
    return call('patch', planPath(plan.id), actor).send({
      revision: plan.revision,
      nombre: plan.nombre,
      formula: plan.formula,
      estructura: structure,
      ...patch,
    });
  }
  async function read(plan: Plan, actor = admin): Promise<PlanView> {
    return (await call('get', planPath(plan.id), actor).expect(200))
      .body as PlanView;
  }
  async function group(
    level = englishLevel,
    assigned = true,
  ): Promise<AttendanceFixtureGroup> {
    const result = await fixture.group(assigned);
    if (result.nivel_id !== level) {
      await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
        result.id,
        level,
      ]);
      result.nivel_id = level;
    }
    return result;
  }
  function apply(
    g: AttendanceFixtureGroup,
    plan: Plan,
    actor = teacher,
    patch: Record<string, unknown> = {},
  ) {
    return call('post', groupPath(g), actor).send({
      planId: plan.id,
      confirmado: true,
      ...patch,
    });
  }
  async function view(
    g: AttendanceFixtureGroup,
    actor = admin,
  ): Promise<GroupView> {
    return (await call('get', groupPath(g), actor).expect(200))
      .body as GroupView;
  }
  async function unit(level = englishLevel, active = true): Promise<string> {
    const [row] = await source.query(
      'INSERT INTO unidades_didacticas(nivel_id,codigo,nombre,creditos,horas_teoricas,horas_practicas,orden,activo) VALUES($1,$2,$2,1,1,1,1,$3) RETURNING id',
      [level, `SYN-B16-UD-${++sequence}`, active],
    );
    return row.id as string;
  }
  async function planSnapshot(planId: string) {
    const [plans, audit] = await Promise.all([
      source.query('SELECT * FROM planes_evaluacion WHERE id=$1::bigint', [
        planId,
      ]),
      source.query(
        "SELECT * FROM auditoria_eventos WHERE entidad='planes_evaluacion' AND entidad_id=$1::text ORDER BY id",
        [planId],
      ),
    ]);
    return { plans, audit };
  }
  async function groupSnapshot(g: AttendanceFixtureGroup) {
    const [
      configuration,
      evaluations,
      indicators,
      enrollments,
      grades,
      results,
      closures,
      audit,
    ] = await Promise.all([
      source.query(
        'SELECT * FROM configuraciones_evaluacion_grupo WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        'SELECT * FROM evaluaciones WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        'SELECT * FROM indicadores_evaluacion WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        'SELECT * FROM matriculas WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        'SELECT * FROM calificaciones WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        'SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1::bigint ORDER BY r.id',
        [g.id],
      ),
      source.query(
        'SELECT * FROM cierres_academicos WHERE grupo_id=$1::bigint ORDER BY id',
        [g.id],
      ),
      source.query(
        "SELECT e.* FROM auditoria_eventos e WHERE e.entidad='configuraciones_evaluacion_grupo' AND e.entidad_id IN (SELECT id::text FROM configuraciones_evaluacion_grupo WHERE grupo_id=$1::bigint) ORDER BY e.id",
        [g.id],
      ),
    ]);
    return {
      configuration,
      evaluations,
      indicators,
      enrollments,
      grades,
      results,
      closures,
      audit,
    };
  }
  async function legacy(g: AttendanceFixtureGroup) {
    const [evaluation] = await source.query(
      "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden) VALUES($1,'Evaluación legacy sintética',100,1) RETURNING id",
      [g.id],
    );
    const [indicator] = await source.query(
      "INSERT INTO indicadores_evaluacion(evaluacion_id,grupo_id,codigo,descripcion,peso_pct,orden) VALUES($1,$2,'LEGACY','Indicador legacy sintético',100,1) RETURNING id",
      [evaluation.id, g.id],
    );
    return {
      evaluationId: evaluation.id as string,
      indicatorId: indicator.id as string,
    };
  }
  async function snapshotSql(
    g: AttendanceFixtureGroup,
    plan: Plan,
    copied = plan.estructura,
    context = true,
    active = true,
  ) {
    return source.transaction(async (manager) => {
      const [config] = await manager.query(
        'INSERT INTO configuraciones_evaluacion_grupo(grupo_id,nivel_id,plan_id,aplicado_por) VALUES($1,$2,$3,$4) RETURNING id',
        [g.id, g.nivel_id, plan.id, adminId],
      );
      if (context)
        await manager.query(
          "SELECT set_config('excel.evaluation_configuration',$1,true)",
          [config.id],
        );
      for (const evaluation of copied.evaluaciones) {
        const [row] = await manager.query(
          'INSERT INTO evaluaciones(grupo_id,unidad_id,nombre,peso_pct,orden,configuracion_id,activo) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            g.id,
            evaluation.unidadId,
            evaluation.nombre,
            evaluation.pesoPct,
            evaluation.orden,
            config.id,
            active,
          ],
        );
        for (const indicator of evaluation.indicadores)
          await manager.query(
            'INSERT INTO indicadores_evaluacion(evaluacion_id,grupo_id,codigo,descripcion,peso_pct,orden,activo) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              row.id,
              g.id,
              indicator.codigo,
              indicator.descripcion,
              indicator.pesoPct,
              indicator.orden,
              active,
            ],
          );
      }
      return config.id as string;
    });
  }

  it('no precarga criterios supuestos y declara preparación bloqueada sin configuración', async () => {
    const g = await group();
    const plans = (await call('get', levelPath(g.nivel_id)).expect(200)).body;
    expect(plans.items).toEqual([]);
    expect(plans.formulaSoportada).toBe(formula);
    const current = await view(g);
    expect(current).toMatchObject({
      configuracion: null,
      plan: null,
      evaluaciones: [],
      preparacionActa: { criteriosAprobados: false, puedeCerrar: false },
    });
    expect(current.preparacionActa.motivos.length).toBeGreaterThan(0);
  });

  it('crea borrador vacío, conserva incompleto y exige aprobación independiente con referencia', async () => {
    const created = await create(englishLevel, { evaluaciones: [] });
    expect(created.plan).toMatchObject({
      estado: 'BORRADOR',
      revision: 1,
      aprobado_por: null,
      aprobado_at: null,
      referencia_aprobacion: null,
      estructura: { evaluaciones: [] },
      creado_por: adminId,
    });
    expect(created.validacion).toMatchObject({
      completa: false,
      evaluaciones: 0,
      indicadores: 0,
      pesoTotalPct: '0.00',
    });
    const before = await planSnapshot(created.plan.id);
    await approve(created.plan).expect(409);
    expect(await planSnapshot(created.plan.id)).toEqual(before);
    const changed = (await update(created.plan, definition()).expect(200))
      .body as PlanView;
    expect(changed.plan).toMatchObject({
      estado: 'BORRADOR',
      revision: 2,
      version: created.plan.version,
      creado_por: adminId,
    });
    expect(changed.validacion).toMatchObject({
      completa: true,
      pesoTotalPct: '100.00',
      evaluaciones: 3,
      indicadores: 3,
      errores: [],
    });
    const accepted = (await approve(changed.plan).expect(201)).body as PlanView;
    expect(accepted.plan).toMatchObject({
      estado: 'APROBADO',
      revision: 3,
      aprobado_por: adminId,
      aprobado_at: expect.any(String),
      referencia_aprobacion: expect.any(String),
    });
    expect(accepted).toMatchObject({ puedeEditar: false, puedeAprobar: false });
    expect(accepted.historial.map((row) => row.accion)).toEqual([
      'CREATE_EVALUATION_PLAN',
      'UPDATE_EVALUATION_PLAN',
      'APPROVE_EVALUATION_PLAN',
    ]);
    expect(accepted.historial[2]).toMatchObject({
      usuario_id: adminId,
      nombre_usuario: 'admin_b16',
      ocurrido_at: expect.any(String),
    });
    expect(accepted.historial[2]).not.toHaveProperty('ip_origen');
  });

  it.each(['inglés', 'portugués'])(
    'aprueba y aplica snapshot persistido de %s con ambos pesos exactos 100.00',
    async (language) => {
      const level = language === 'inglés' ? englishLevel : portugueseLevel;
      const ownUnit = await unit(level);
      const plan = await approved(
        level,
        definition(
          ['33.33', '33.33', '33.34'],
          ['33.33', '33.33', '33.34'],
          ownUnit,
        ),
      );
      const g = await group(level);
      const student = await fixture.student();
      await fixture.enroll(g, student);
      const before = await groupSnapshot(g);
      const applied = (await apply(g, plan).expect(201)).body as GroupView;
      expect(applied.configuracion).toMatchObject({
        grupo_id: g.id,
        nivel_id: level,
        plan_id: plan.id,
        aplicado_por: fixture.userIds.docente,
        aplicado_at: expect.any(String),
      });
      expect(applied.evaluaciones.map((row) => row.peso_pct)).toEqual([
        '33.33',
        '33.33',
        '33.34',
      ]);
      for (const row of applied.evaluaciones) {
        expect(row.unidad_id).toBe(ownUnit);
        expect(row.indicadores.map((item) => item.peso_pct)).toEqual([
          '33.33',
          '33.33',
          '33.34',
        ]);
      }
      expect(applied).toMatchObject({
        puedeAplicar: false,
        preparacionActa: {
          criteriosAprobados: true,
          matriculasRevisables: 1,
          indicadores: 9,
          calificacionesEsperadas: 9,
          calificacionesRegistradas: 0,
          calificacionesPendientes: 9,
          puedeCerrar: false,
        },
      });
      const after = await groupSnapshot(g);
      expect(after.enrollments).toEqual(before.enrollments);
      expect(after.results).toEqual(before.results);
      expect(after.grades).toEqual(before.grades);
      expect(after.closures).toEqual(before.closures);
      expect(after.audit).toHaveLength(1);
      expect(after.audit[0]).toMatchObject({
        accion: 'APPLY_EVALUATION_PLAN',
        usuario_id: fixture.userIds.docente,
      });
    },
  );

  it.each(['99.99', '100.01'])(
    'rechaza aprobación con suma de evaluaciones %s',
    async (total) => {
      const weights =
        total === '99.99'
          ? ['33.33', '33.33', '33.33']
          : ['33.33', '33.33', '33.35'];
      const draft = await create(englishLevel, definition(weights));
      expect(draft.validacion).toMatchObject({
        completa: false,
        pesoTotalPct: total,
      });
      const before = await planSnapshot(draft.plan.id);
      await approve(draft.plan).expect(409);
      expect(await planSnapshot(draft.plan.id)).toEqual(before);
    },
  );

  it('exige indicadores y su propia suma exacta aunque evaluaciones sumen 100', async () => {
    for (const weights of [
      [],
      ['33.33', '33.33', '33.33'],
      ['33.33', '33.33', '33.35'],
    ]) {
      const draft = await create(englishLevel, definition(['100'], weights));
      expect(draft.validacion.completa).toBe(false);
      await approve(draft.plan).expect(409);
    }
  });

  it('valida pesos estrictos, duplicados, órdenes, fórmula y campos desconocidos sin guardar versiones', async () => {
    const before = await source.query(
      'SELECT * FROM planes_evaluacion ORDER BY id',
    );
    for (const peso of [
      '0',
      '-1',
      '+10',
      '1e2',
      '33,33',
      '100.01',
      '0.001',
      '',
      50,
    ]) {
      const body = definition(['100']);
      await call('post', levelPath(englishLevel))
        .send({
          nombre: 'Plan inválido sintético',
          formula,
          estructura: {
            evaluaciones: [{ ...body.evaluaciones[0]!, pesoPct: peso }],
          },
        })
        .expect(400);
    }
    for (const mutate of [
      (body: Definition) => {
        body.evaluaciones[1]!.nombre = body.evaluaciones[0]!.nombre;
      },
      (body: Definition) => {
        body.evaluaciones[1]!.orden = body.evaluaciones[0]!.orden;
      },
      (body: Definition) => {
        body.evaluaciones[0]!.orden = 0;
      },
      (body: Definition) => {
        body.evaluaciones[0]!.indicadores = [
          body.evaluaciones[0]!.indicadores[0]!,
          { ...body.evaluaciones[0]!.indicadores[0]! },
        ];
      },
      (body: Definition) => {
        body.evaluaciones[0]!.indicadores[0]!.descripcion = '';
      },
    ]) {
      const body = definition();
      mutate(body);
      await create(englishLevel, body, admin, {}, 400);
    }
    await create(
      englishLevel,
      definition(),
      admin,
      { formula: 'PROMEDIO_SUPUESTO' },
      400,
    );
    await create(englishLevel, definition(), admin, { extra: true }, 400);
    expect(
      await source.query('SELECT * FROM planes_evaluacion ORDER BY id'),
    ).toEqual(before);
  });

  it.each(['docente', 'secretaria', 'coordinador'])(
    'permite consulta a %s sin creación, edición ni aprobación',
    async (name) => {
      const plan = (await create()).plan;
      const actor = await login(name);
      const current = await read(plan, actor);
      expect(current).toMatchObject({
        puedeEditar: false,
        puedeAprobar: false,
      });
      const before = await planSnapshot(plan.id);
      await create(englishLevel, definition(), actor, {}, 403);
      await update(plan, definition(), actor).expect(403);
      await approve(plan, actor).expect(403);
      expect(await planSnapshot(plan.id)).toEqual(before);
    },
  );

  it('el docente ajeno no accede al nivel/plan/grupo; otro rol lector no autoriza aplicar', async () => {
    const plan = await approved();
    const g = await group(englishLevel, false);
    const foreign = await login('ajeno');
    expect(
      (await call('get', 'evaluacion/niveles', foreign).expect(200)).body.items,
    ).toEqual([]);
    for (const path of [
      levelPath(englishLevel),
      planPath(plan.id),
      groupPath(g),
    ])
      await call('get', path, foreign).expect(403);
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
      [fixture.userIds.ajeno, adminId],
    );
    try {
      expect((await view(g, foreign)).puedeAplicar).toBe(false);
      await apply(g, plan, foreign).expect(403);
    } finally {
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='SECRETARIA')",
        [fixture.userIds.ajeno],
      );
    }
    expect((await groupSnapshot(g)).configuration).toHaveLength(0);
  });

  it('ADMIN aplica a grupo ajeno y docentes asignados aplican exclusivamente planes aprobados', async () => {
    const draft = (await create()).plan;
    const g = await group();
    await apply(g, draft).expect(409);
    const plan = (await approve(draft).expect(201)).body.plan as Plan;
    const foreignGroup = await group(englishLevel, false);
    await apply(foreignGroup, plan, teacher).expect(403);
    await apply(foreignGroup, plan, admin).expect(201);
    await apply(g, plan, await login('docente2')).expect(201);
    expect((await view(foreignGroup)).configuracion!.aplicado_por).toBe(
      adminId,
    );
  });

  it('rechaza revisión anterior y dos ediciones o aprobaciones concurrentes conservan un solo cambio', async () => {
    const plan = (await create()).plan;
    const changed = (await update(plan, definition(['50', '50'])).expect(200))
      .body.plan as Plan;
    await update(plan).expect(409);
    await approve(plan).expect(409);
    const responses = await Promise.all([approve(changed), approve(changed)]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect((await read(changed)).plan.revision).toBe(changed.revision + 1);
    const draft = (await create()).plan;
    const updates = await Promise.all([
      update(draft, definition(['100'])),
      update(draft, definition(['50', '50'])),
    ]);
    expect(
      updates.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    expect((await read(draft)).plan.revision).toBe(2);
  });

  it('la aprobación exige referencia y confirmación explícita y un plan aprobado no se edita ni reaprueba', async () => {
    const draft = (await create()).plan;
    for (const patch of [
      { referenciaAprobacion: '' },
      { referenciaAprobacion: '   ' },
      { referenciaAprobacion: 'x'.repeat(401) },
      { confirmado: false },
      { revision: 0 },
    ])
      await approve(draft, admin, patch).expect(400);
    const plan = (await approve(draft).expect(201)).body.plan as Plan;
    const before = await planSnapshot(plan.id);
    await update(plan).expect(409);
    await approve(plan).expect(409);
    expect(await planSnapshot(plan.id)).toEqual(before);
  });

  it('dos aplicaciones concurrentes crean exactamente un snapshot y no sobrescriben una aplicación previa', async () => {
    const plan = await approved();
    const g = await group();
    const responses = await Promise.all([
      apply(g, plan),
      apply(g, plan, admin),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const before = await groupSnapshot(g);
    expect(before.configuration).toHaveLength(1);
    expect(before.evaluations).toHaveLength(3);
    expect(before.indicators).toHaveLength(3);
    expect(before.audit).toHaveLength(1);
    await apply(g, plan).expect(409);
    expect(await groupSnapshot(g)).toEqual(before);
  });

  it('una versión futura no modifica el plan y las evaluaciones del grupo anterior', async () => {
    const first = await approved();
    const g = await group();
    await apply(g, first).expect(201);
    const before = await groupSnapshot(g);
    const second = await approved(englishLevel, definition(['60', '40']));
    expect(second.version).toBeGreaterThan(first.version);
    const nextGroup = await group();
    await apply(nextGroup, second).expect(201);
    expect(await groupSnapshot(g)).toEqual(before);
    expect((await view(g)).plan!.id).toBe(first.id);
    expect((await view(nextGroup)).plan!.id).toBe(second.id);
  });

  it('rechaza unidades de otro nivel e inactivas en guardar, aprobar y aplicar; mantiene lectura histórica', async () => {
    const foreign = await unit(portugueseLevel);
    const inactive = await unit(englishLevel, false);
    for (const id of [foreign, inactive]) {
      await call('post', levelPath(englishLevel))
        .send({
          nombre: 'Unidad inválida sintética',
          formula,
          estructura: definition(['100'], ['100'], id),
        })
        .expect(409);
    }
    const own = await unit();
    const draft = (
      await create(englishLevel, definition(['100'], ['100'], own))
    ).plan;
    await source.query(
      'UPDATE unidades_didacticas SET activo=false WHERE id=$1',
      [own],
    );
    const blockedDraft = await read(draft);
    expect(blockedDraft.puedeAprobar).toBe(false);
    expect(blockedDraft.validacion.completa).toBe(false);
    expect(blockedDraft.validacion.errores.join(' ').toLowerCase()).toContain(
      'unidad',
    );
    await approve(draft).expect(409);
    await source.query(
      'UPDATE unidades_didacticas SET activo=true WHERE id=$1',
      [own],
    );
    expect((await read(draft)).puedeAprobar).toBe(true);
    const accepted = (await approve(draft).expect(201)).body.plan as Plan;
    const g = await group();
    await apply(g, accepted).expect(201);
    const before = await groupSnapshot(g);
    await source.query(
      'UPDATE unidades_didacticas SET activo=false WHERE id=$1',
      [own],
    );
    expect((await read(accepted)).plan.estado).toBe('APROBADO');
    expect((await view(g)).evaluaciones[0]!.unidad_id).toBe(own);
    expect(await groupSnapshot(g)).toEqual(before);
    const newGroup = await group();
    await apply(newGroup, accepted).expect(409);
    expect((await groupSnapshot(newGroup)).configuration).toHaveLength(0);
  });

  it('grupo o periodo cerrados bloquean aplicar y el cierre de ASISTENCIA permanece independiente', async () => {
    const plan = await approved();
    const closedGroup = await group();
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      closedGroup.id,
    ]);
    expect((await view(closedGroup)).puedeAplicar).toBe(false);
    await apply(closedGroup, plan, admin).expect(409);
    const closedPeriod = await group();
    await source.query(
      "UPDATE periodos_academicos SET estado='CERRADO' WHERE id=$1",
      [closedPeriod.periodo_id],
    );
    await apply(closedPeriod, plan, admin).expect(409);
    const g = await group();
    const closurePath = `asistencia/grupos/${g.id}/cierre`;
    const review = (await call('get', closurePath).expect(200)).body;
    await call('post', closurePath)
      .send({ revision: review.revision, confirmarPendientes: true })
      .expect(201);
    const before = await groupSnapshot(g);
    await apply(g, plan).expect(201);
    expect((await view(g)).grupo.asistencia_cerrada).toBe(true);
    expect((await groupSnapshot(g)).closures).toEqual(before.closures);
  });

  it('permite configurar un grupo planificado dentro de un periodo planificado', async () => {
    const g = await group();
    await source.query("UPDATE grupos SET estado='PLANIFICADO' WHERE id=$1", [
      g.id,
    ]);
    await source.query(
      "UPDATE periodos_academicos SET estado='PLANIFICADO' WHERE id=$1",
      [g.periodo_id],
    );
    const plan = await approved();
    expect((await view(g)).puedeAplicar).toBe(true);
    await apply(g, plan, admin).expect(201);
    expect((await view(g)).configuracion!.plan_id).toBe(plan.id);
  });

  it('el rol ADMIN combinado con DOCENTE sí autoriza aplicar a un grupo ajeno', async () => {
    const g = await group(englishLevel, false);
    const plan = await approved();
    const combined = await login('ajeno');
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='ADMIN'",
      [fixture.userIds.ajeno, adminId],
    );
    try {
      expect((await view(g, combined)).puedeAplicar).toBe(true);
      await apply(g, plan, combined).expect(201);
    } finally {
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='ADMIN')",
        [fixture.userIds.ajeno],
      );
    }
    expect((await view(g)).configuracion!.aplicado_por).toBe(
      fixture.userIds.ajeno,
    );
  });

  it('reserva legacy, notas y resultados existentes sin convertirlos ni sobrescribir su historia', async () => {
    const plan = await approved();
    const g = await group();
    const legacyData = await legacy(g);
    const enrollment = await fixture.enroll(g, await fixture.student());
    await source.query(
      'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,0,$4)',
      [enrollment.id, legacyData.indicatorId, g.id, adminId],
    );
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,0,0,'APROBADO',now())",
      [enrollment.id],
    );
    const before = await groupSnapshot(g);
    expect(before.evaluations[0].configuracion_id).toBeNull();
    expect((await view(g)).puedeAplicar).toBe(false);
    await apply(g, plan, admin).expect(409);
    expect(await groupSnapshot(g)).toEqual(before);
    expect((await view(g)).preparacionActa).toMatchObject({
      criteriosAprobados: false,
      puedeCerrar: false,
    });
  });

  it('nota cero cuenta como registrada, pendiente no es cero y excluye matrículas no revisables', async () => {
    const g = await group();
    const active = await fixture.enroll(g, await fixture.student());
    const closed = await fixture.enroll(g, await fixture.student(), 'CERRADA');
    await fixture.enroll(g, await fixture.student(), 'PENDIENTE');
    await fixture.enroll(g, await fixture.student(), 'ANULADA');
    const plan = await approved(englishLevel, definition(['100'], ['100']));
    const applied = (await apply(g, plan).expect(201)).body as GroupView;
    const indicator = applied.evaluaciones[0]!.indicadores[0]!.id;
    expect(applied.preparacionActa).toMatchObject({
      matriculasRevisables: 2,
      indicadores: 1,
      calificacionesEsperadas: 2,
      calificacionesRegistradas: 0,
      calificacionesPendientes: 2,
      puedeCerrar: false,
    });
    await source.query(
      'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,0,$4)',
      [active.id, indicator, g.id, adminId],
    );
    expect((await view(g)).preparacionActa).toMatchObject({
      calificacionesRegistradas: 1,
      calificacionesPendientes: 1,
      puedeCerrar: false,
    });
    const service = app.get(EvaluationService);
    await expect(
      source.transaction((manager) =>
        service.requireGradeClosureReady(manager, g.id),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await source.query(
      'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,20,$4)',
      [closed.id, indicator, g.id, adminId],
    );
    expect((await view(g)).preparacionActa).toMatchObject({
      criteriosAprobados: true,
      calificacionesRegistradas: 2,
      calificacionesPendientes: 0,
      puedeCerrar: true,
      motivos: [],
    });
    await expect(
      source.transaction((manager) =>
        service.requireGradeClosureReady(manager, g.id),
      ),
    ).resolves.toMatchObject({
      puedeCerrar: true,
      calificacionesPendientes: 0,
    });
    expect((await groupSnapshot(g)).results).toHaveLength(0);
    expect((await groupSnapshot(g)).closures).toHaveLength(0);
  });

  it('no permite cierre de acta sin matrículas aun con una estructura aprobada aplicada', async () => {
    const g = await group();
    const plan = await approved();
    const applied = (await apply(g, plan).expect(201)).body as GroupView;
    expect(applied.preparacionActa).toMatchObject({
      criteriosAprobados: true,
      matriculasRevisables: 0,
      calificacionesEsperadas: 0,
      puedeCerrar: false,
    });
    expect(applied.preparacionActa.motivos.length).toBeGreaterThan(0);
    await expect(
      source.transaction((manager) =>
        app.get(EvaluationService).requireGradeClosureReady(manager, g.id),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('la creación revierte versión y auditoría si falla guardar evidencia o construir la vista', async () => {
    for (const failure of ['auditoría', 'lectura']) {
      const before = await source.query(
        'SELECT * FROM planes_evaluacion ORDER BY id',
      );
      const [beforeAudit] = await source.query(
        "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='planes_evaluacion'",
      );
      if (failure === 'auditoría')
        vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
          new Error('Fallo sintético de auditoría al crear'),
        );
      else
        vi.spyOn(app.get(EvaluationRepository), 'units').mockRejectedValueOnce(
          new Error('Fallo sintético de vista tras crear'),
        );
      await create(englishLevel, definition(), admin, {}, 500);
      expect(
        await source.query('SELECT * FROM planes_evaluacion ORDER BY id'),
      ).toEqual(before);
      expect(
        (
          await source.query(
            "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='planes_evaluacion'",
          )
        )[0].n,
      ).toBe(beforeAudit.n);
      vi.restoreAllMocks();
    }
    await create();
  });

  it('fallo de lectura de preparación tras copiar estructura revierte snapshot y permite reintentar', async () => {
    const plan = await approved();
    const g = await group();
    const before = await groupSnapshot(g);
    vi.spyOn(
      app.get(EvaluationService),
      'gradeReadiness',
    ).mockRejectedValueOnce(
      new Error('Fallo sintético de lectura después de copiar'),
    );
    await apply(g, plan).expect(500);
    expect(await groupSnapshot(g)).toEqual(before);
    vi.restoreAllMocks();
    await apply(g, plan).expect(201);
  });

  it('la revocación del rol ADMIN impide aprobación incluso con sesión y permiso de consulta vigentes', async () => {
    const plan = (await create()).plan;
    const before = await planSnapshot(plan.id);
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$1 FROM roles WHERE codigo='SECRETARIA'",
      [adminId],
    );
    await source.query(
      "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id IN (SELECT id FROM roles WHERE codigo='ADMIN')",
      [adminId],
    );
    try {
      await approve(plan).expect(403);
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
    expect(await planSnapshot(plan.id)).toEqual(before);
  });

  it('un plan de otro nivel y resultados sin criterios existentes tampoco pueden aplicarse al grupo', async () => {
    const plan = await approved(portugueseLevel);
    const g = await group();
    await apply(g, plan, admin).expect(409);
    const own = await approved();
    const enrollment = await fixture.enroll(
      g,
      await fixture.student(),
      'CERRADA',
    );
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,16,16,0,0,0,'APROBADO',now())",
      [enrollment.id],
    );
    const before = await groupSnapshot(g);
    expect(before.evaluations).toHaveLength(0);
    await apply(g, own, admin).expect(409);
    expect(await groupSnapshot(g)).toEqual(before);
  });

  it('revalida asignación y perfil docente activo antes de aplicar y conserva la consulta autorizada', async () => {
    const g = await group();
    const plan = await approved();
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1 AND docente_id=$2',
      [g.id, fixture.teacherId],
    );
    await apply(g, plan).expect(403);
    await source.query(
      'UPDATE grupo_docentes SET activo=true WHERE grupo_id=$1 AND docente_id=$2',
      [g.id, fixture.teacherId],
    );
    await source.query('UPDATE docentes SET activo=false WHERE id=$1', [
      fixture.teacherId,
    ]);
    try {
      await apply(g, plan).expect(403);
    } finally {
      await source.query('UPDATE docentes SET activo=true WHERE id=$1', [
        fixture.teacherId,
      ]);
    }
    const revoked = await login('docente');
    await call('post', 'auth/logout', revoked).send({}).expect(204);
    await apply(g, plan, revoked).expect(401);
    expect((await groupSnapshot(g)).configuration).toHaveLength(0);
    await apply(g, plan).expect(201);
  });

  it.each(['edición', 'aprobación', 'aplicación'])(
    'fallo de auditoría en %s revierte todos los datos y permite reintento',
    async (action) => {
      const draft = (await create()).plan;
      const g = await group();
      const plan =
        action === 'aplicación'
          ? ((await approve(draft).expect(201)).body.plan as Plan)
          : draft;
      const beforePlan = await planSnapshot(plan.id);
      const beforeGroup = await groupSnapshot(g);
      vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
        new Error('Fallo sintético de auditoría B16'),
      );
      const operation = () =>
        action === 'edición'
          ? update(plan, definition(['100']))
          : action === 'aprobación'
            ? approve(plan)
            : apply(g, plan);
      await operation().expect(500);
      expect(await planSnapshot(plan.id)).toEqual(beforePlan);
      expect(await groupSnapshot(g)).toEqual(beforeGroup);
      vi.restoreAllMocks();
      await operation().expect(action === 'edición' ? 200 : 201);
    },
  );

  it('la BD valida estructura, aprobación, referencias de unidad y versiones de borrador', async () => {
    const draft = (await create()).plan;
    const before = await planSnapshot(draft.id);
    for (const query of [
      'UPDATE planes_evaluacion SET revision=revision WHERE id=$1',
      'UPDATE planes_evaluacion SET version=version+1,revision=revision+1 WHERE id=$1',
      "UPDATE planes_evaluacion SET estructura='{}'::jsonb,revision=revision+1 WHERE id=$1",
      "UPDATE planes_evaluacion SET estado='APROBADO',revision=revision+1 WHERE id=$1",
      'DELETE FROM planes_evaluacion WHERE id=$1',
    ])
      await expect(source.query(query, [draft.id])).rejects.toBeDefined();
    const invalid = definition(['99.99']);
    await expect(
      source.query(
        "UPDATE planes_evaluacion SET estructura=$2::jsonb,estado='APROBADO',revision=revision+1,aprobado_por=$3,aprobado_at=now(),referencia_aprobacion='Referencia sintética SQL' WHERE id=$1",
        [draft.id, JSON.stringify(invalid), adminId],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const foreign = await unit(portugueseLevel);
    await expect(
      source.query(
        'UPDATE planes_evaluacion SET estructura=$2::jsonb,revision=revision+1 WHERE id=$1',
        [draft.id, JSON.stringify(definition(['100'], ['100'], foreign))],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    for (const body of [
      {
        evaluaciones: [
          { ...definition(['100']).evaluaciones[0]!, pesoPct: 100 },
        ],
      },
      {
        evaluaciones: [
          { ...definition(['100']).evaluaciones[0]!, pesoPct: '1e2' },
        ],
      },
      {
        evaluaciones: definition(['50', '50']).evaluaciones.map(
          (component) => ({
            ...component,
            nombre: 'Duplicado SQL',
          }),
        ),
      },
      {
        evaluaciones: [
          {
            ...definition(['100']).evaluaciones[0]!,
            indicadores: [
              {
                codigo: 'DUP',
                descripcion: 'Sintético SQL',
                pesoPct: '50',
                orden: 1,
              },
              {
                codigo: 'DUP',
                descripcion: 'Sintético SQL',
                pesoPct: '50',
                orden: 2,
              },
            ],
          },
        ],
      },
    ])
      await expect(
        source.query(
          'UPDATE planes_evaluacion SET estructura=$2::jsonb,revision=revision+1 WHERE id=$1',
          [draft.id, JSON.stringify(body)],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await planSnapshot(draft.id)).toEqual(before);
  });

  it('DEFERRED impide configuración parcial o alterada incluso con contexto GUC válido', async () => {
    const plan = await approved();
    for (const variant of [
      'parcial',
      'peso',
      'nombre',
      'orden',
      'indicador',
      'extra',
    ]) {
      const g = await group();
      const copied = structuredClone(plan.estructura);
      if (variant === 'parcial') copied.evaluaciones.pop();
      if (variant === 'peso') copied.evaluaciones[0]!.pesoPct = '33.34';
      if (variant === 'nombre')
        copied.evaluaciones[0]!.nombre = 'Nombre sustituido';
      if (variant === 'orden') copied.evaluaciones[0]!.orden = 99;
      if (variant === 'indicador') copied.evaluaciones[0]!.indicadores = [];
      if (variant === 'extra')
        copied.evaluaciones.push({
          ...copied.evaluaciones[0]!,
          nombre: 'Evaluación extra sintética',
          orden: 99,
        });
      await expect(snapshotSql(g, plan, copied)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
      expect((await groupSnapshot(g)).configuration).toHaveLength(0);
      expect((await groupSnapshot(g)).evaluations).toHaveLength(0);
      expect((await groupSnapshot(g)).indicators).toHaveLength(0);
    }
    const complete = await group();
    const inactive = await group();
    await expect(
      snapshotSql(inactive, plan, plan.estructura, true, false),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(snapshotSql(complete, plan)).resolves.toEqual(
      expect.any(String),
    );
    expect((await groupSnapshot(complete)).evaluations).toHaveLength(3);
  });

  it('snapshot inicial exige GUC local y no admite legacy, filas extras ni mutaciones posteriores', async () => {
    const plan = await approved();
    const g = await group();
    await expect(
      snapshotSql(g, plan, plan.estructura, false),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect((await groupSnapshot(g)).configuration).toHaveLength(0);
    const applied = (await apply(g, plan, admin).expect(201)).body as GroupView;
    const before = await groupSnapshot(g);
    for (const query of [
      "UPDATE evaluaciones SET nombre='Sustitución' WHERE id=$1",
      'UPDATE evaluaciones SET activo=false WHERE id=$1',
      'DELETE FROM evaluaciones WHERE id=$1',
      'DELETE FROM configuraciones_evaluacion_grupo WHERE id=$1',
      'UPDATE configuraciones_evaluacion_grupo SET aplicado_por=aplicado_por WHERE id=$1',
    ])
      await expect(
        source.query(query, [
          query.includes('configuraciones')
            ? applied.configuracion!.id
            : applied.evaluaciones[0]!.id,
        ]),
      ).rejects.toBeDefined();
    await expect(
      source.query(
        "UPDATE indicadores_evaluacion SET descripcion='Sustitución' WHERE id=$1",
        [applied.evaluaciones[0]!.indicadores[0]!.id],
      ),
    ).rejects.toBeDefined();
    await expect(legacy(g)).rejects.toBeDefined();
    await expect(
      source.query(
        "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden,configuracion_id) VALUES($1,'Sin contexto después de aplicar',100,99,$2)",
        [g.id, applied.configuracion!.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(
        "SELECT set_config('excel.evaluation_configuration',$1,true)",
        [applied.configuracion!.id],
      );
      await runner.query(
        "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden,configuracion_id) VALUES($1,'Extra con GUC',100,99,$2)",
        [g.id, applied.configuracion!.id],
      );
      await expect(runner.commitTransaction()).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await groupSnapshot(g)).toEqual(before);
  });

  it('la BD impide aplicar borradores, otro nivel, grupo cerrado o legacy incluso fuera de HTTP', async () => {
    const draft = (await create()).plan;
    const plan = await approved();
    const unapprovedGroup = await group();
    await expect(snapshotSql(unapprovedGroup, draft)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    const foreignGroup = await group(portugueseLevel);
    await expect(snapshotSql(foreignGroup, plan)).rejects.toBeDefined();
    const closedGroup = await group();
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      closedGroup.id,
    ]);
    await expect(snapshotSql(closedGroup, plan)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    const legacyGroup = await group();
    await legacy(legacyGroup);
    const before = await groupSnapshot(legacyGroup);
    await expect(snapshotSql(legacyGroup, plan)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    expect(await groupSnapshot(legacyGroup)).toEqual(before);
    for (const g of [unapprovedGroup, foreignGroup, closedGroup])
      expect((await groupSnapshot(g)).configuration).toHaveLength(0);
  });

  it('aprobados y configuraciones son inmutables; la reversión no elimina historia', async () => {
    const plan = await approved();
    const g = await group();
    await apply(g, plan, admin).expect(201);
    const before = await planSnapshot(plan.id);
    const beforeGroup = await groupSnapshot(g);
    for (const query of [
      "UPDATE planes_evaluacion SET nombre='Otra versión' WHERE id=$1",
      'DELETE FROM planes_evaluacion WHERE id=$1',
    ])
      await expect(source.query(query, [plan.id])).rejects.toBeDefined();
    for (const table of [
      'planes_evaluacion',
      'configuraciones_evaluacion_grupo',
    ])
      await expect(
        source.query(`TRUNCATE ${table} CASCADE`),
      ).rejects.toBeDefined();
    await expect(
      checkMigrationReversal(source, new PlanesEvaluacion1790208012000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await planSnapshot(plan.id)).toEqual(before);
    expect(await groupSnapshot(g)).toEqual(beforeGroup);
  });

  it('un snapshot SQL anterior a la aplicación no agrega criterios legacy después del nuevo snapshot', async () => {
    const g = await group();
    const plan = await approved();
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction('REPEATABLE READ');
      await runner.query('SELECT id FROM grupos WHERE id=$1', [g.id]);
      await apply(g, plan, admin).expect(201);
      await expect(
        runner.query(
          "INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden) VALUES($1,'Legacy desde snapshot obsoleto',100,99)",
          [g.id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '40001' } });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await groupSnapshot(g)).evaluations).toHaveLength(3);
  });

  it('un snapshot SQL anterior a la referencia del plan no elimina ni mueve la unidad didáctica', async () => {
    for (const mutation of ['eliminar', 'mover']) {
      const ownUnit = await unit();
      const runner = source.createQueryRunner();
      let savedPlan: Plan | undefined;
      try {
        await runner.startTransaction('REPEATABLE READ');
        // Fija la vista anterior sin mantener locks que impidan crear el plan.
        await runner.query(
          'SELECT id,nivel_id FROM unidades_didacticas WHERE id=$1',
          [ownUnit],
        );
        savedPlan = (
          await create(englishLevel, definition(['100'], ['100'], ownUnit))
        ).plan;
        await expect(
          mutation === 'eliminar'
            ? runner.query('DELETE FROM unidades_didacticas WHERE id=$1', [
                ownUnit,
              ])
            : runner.query(
                'UPDATE unidades_didacticas SET nivel_id=$2 WHERE id=$1',
                [ownUnit, portugueseLevel],
              ),
        ).rejects.toMatchObject({ driverError: { code: '40001' } });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      expect(
        (
          await source.query(
            'SELECT id,nivel_id FROM unidades_didacticas WHERE id=$1',
            [ownUnit],
          )
        )[0],
      ).toEqual({ id: ownUnit, nivel_id: englishLevel });
      expect(
        (await read(savedPlan!)).plan.estructura.evaluaciones[0]!.unidadId,
      ).toBe(ownUnit);
      await source.query(
        'UPDATE unidades_didacticas SET activo=false WHERE id=$1',
        [ownUnit],
      );
      expect(
        (await read(savedPlan!)).plan.estructura.evaluaciones[0]!.unidadId,
      ).toBe(ownUnit);
    }
    const sharedUnit = await unit();
    const sharedDefinition = definition(['100'], ['100'], sharedUnit);
    const drafts = await Promise.all([
      create(englishLevel, sharedDefinition),
      create(englishLevel, sharedDefinition),
    ]);
    expect(new Set(drafts.map((draft) => draft.plan.id)).size).toBe(2);
    expect(new Set(drafts.map((draft) => draft.plan.version)).size).toBe(2);
    const updated = await Promise.all(
      drafts.map((draft) => update(draft.plan, sharedDefinition).expect(200)),
    );
    for (const response of updated)
      expect(response.body.plan).toMatchObject({
        revision: 2,
        estado: 'BORRADOR',
        estructura: { evaluaciones: [{ unidadId: sharedUnit }] },
      });
  });

  it('OpenAPI documenta versiones, aprobación explícita, preparación y ninguna escritura de notas o actas', async () => {
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    const base = '/api/v1/evaluacion';
    expect(spec.paths[`${base}/niveles`].get).toBeDefined();
    expect(spec.paths[`${base}/niveles/{nivelId}/planes`].post).toBeDefined();
    expect(spec.paths[`${base}/planes/{planId}`].patch).toBeDefined();
    expect(spec.paths[`${base}/planes/{planId}/aprobacion`].post).toBeDefined();
    expect(
      spec.paths[`${base}/grupos/{grupoId}/configuracion`].post,
    ).toBeDefined();
    const evaluationPaths = Object.keys(spec.paths).filter((path) =>
      path.startsWith(base),
    );
    expect(
      evaluationPaths.some((path) =>
        /notas|calificaciones|acta|cierre/.test(path),
      ),
    ).toBe(false);
    expect(JSON.stringify(spec)).toContain('PONDERADA_JERARQUICA_V1');
    expect(JSON.stringify(spec.paths)).toContain('preparacionActa');
  });
});
