import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { ReportWorkbookService } from '../src/modules/reportes/report-workbook.service.js';
import { ReportsRepository } from '../src/modules/reportes/reports.repository.js';
import { ReportsService } from '../src/modules/reportes/reports.service.js';
import type {
  ReportPage,
  ReportType,
} from '../src/modules/reportes/report.model.js';
import { Exportaciones1790208015000 } from '../src/database/migraciones/1790208015000-exportaciones.js';
import { checkMigrationReversal } from './migration-test.js';
import {
  attendanceFixture,
  type AttendanceFixtures,
  type AttendanceFixtureGroup,
} from './attendance.fixture.js';
import { insertHistoricalAct } from './student-history.fixture.js';
import { freePort } from './browser-server.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B19 con pnpm test:db');

const password = 'Sintetica-segura-B19';
type Login = { cookie: string; csrf: string };
type Configuration = {
  configuracion: { id: string };
  evaluaciones: { indicadores: { id: string }[] }[];
};

describe('B19 borradores XLSX con autorización, revisión y evidencia transaccional', () => {
  let source: DataSource;
  let app: INestApplication;
  let fixture: AttendanceFixtures;
  let adminId: string;
  let admin: Login;
  let teacher: Login;
  let stranger: Login;
  let secretary: Login;
  let coordinator: Login;
  let origin: string;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_reports_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_reports_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    adminId = (await bootstrapAdministrator(source, 'admin_b19', password)).id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    fixture = await attendanceFixture(source, adminId, password);
    origin = `http://127.0.0.1:${await freePort()}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await login('admin_b19');
    teacher = await login('docente');
    stranger = await login('ajeno');
    secretary = await login('secretaria');
    coordinator = await login('coordinador');
  }, 60000);
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
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
  const path = (group: AttendanceFixtureGroup) => `reportes/grupos/${group.id}`;
  async function preview(
    group: AttendanceFixtureGroup,
    tipo: ReportType = 'MATRIZ_NOTAS',
    actor = admin,
    page = '',
  ): Promise<ReportPage> {
    return (
      await call('get', `${path(group)}?tipo=${tipo}${page}`, actor).expect(200)
    ).body as ReportPage;
  }
  function exported(
    group: AttendanceFixtureGroup,
    view: ReportPage,
    actor = admin,
  ) {
    return call('post', `${path(group)}/exportaciones`, actor)
      .send({ tipo: view.tipo, revision: view.revision })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      });
  }
  async function workbook(response: request.Response) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(response.body as Buffer).buffer);
    return book;
  }
  async function configure(
    group: AttendanceFixtureGroup,
  ): Promise<Configuration> {
    const plan = (
      await call('post', `evaluacion/niveles/${group.nivel_id}/planes`)
        .send({
          nombre: `Plan sintético B19 ${++sequence}`,
          formula: 'PONDERADA_JERARQUICA_V1',
          estructura: {
            evaluaciones: [
              {
                nombre: 'Evaluación sintética B19',
                unidadId: null,
                pesoPct: '100',
                orden: 1,
                indicadores: [
                  {
                    codigo: 'SYN-B19',
                    descripcion: 'Indicador sintético B19',
                    pesoPct: '100',
                    orden: 1,
                  },
                ],
              },
            ],
          },
        })
        .expect(201)
    ).body.plan as { id: string; revision: number };
    await call('post', `evaluacion/planes/${plan.id}/aprobacion`)
      .send({
        revision: plan.revision,
        referenciaAprobacion:
          'Datos sintéticos B19; no aprobación institucional real',
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
    language: 'EN' | 'PT' = 'EN',
    note: string | null = '12.40',
    withConfiguration = true,
  ) {
    const group = await fixture.group();
    if (language === 'PT') {
      const [selected] = await source.query(
        "SELECT nivel_id FROM grupos WHERE codigo='DEMO-PT-G1'",
      );
      await source.query('UPDATE grupos SET nivel_id=$2 WHERE id=$1', [
        group.id,
        selected.nivel_id,
      ]);
      group.nivel_id = selected.nivel_id as string;
    }
    const configuration = withConfiguration ? await configure(group) : null;
    const student = await fixture.student();
    const enrollment = await fixture.enroll(group, student);
    const session = await fixture.session(group, 'REALIZADA');
    await source.query(
      "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
      [group.id, session.id, enrollment.id, fixture.userIds.docente],
    );
    const indicatorId =
      configuration?.evaluaciones[0]!.indicadores[0]!.id ?? null;
    if (note !== null && indicatorId)
      await call(
        'patch',
        `evaluacion/grupos/${group.id}/calificaciones`,
        teacher,
      )
        .send({
          registros: [
            {
              matriculaId: enrollment.id,
              indicadorId: indicatorId,
              nota: note,
              version: null,
            },
          ],
        })
        .expect(200);
    return { group, configuration, student, enrollment, session, indicatorId };
  }
  async function evidence(group: AttendanceFixtureGroup) {
    return {
      exports: await source.query(
        'SELECT * FROM exportaciones WHERE grupo_id=$1 ORDER BY id',
        [group.id],
      ),
      audit: await source.query(
        "SELECT * FROM auditoria_eventos WHERE entidad='exportaciones' AND entidad_id IN (SELECT id::text FROM exportaciones WHERE grupo_id=$1) ORDER BY id",
        [group.id],
      ),
    };
  }
  async function close(group: AttendanceFixtureGroup) {
    const attendancePath = `asistencia/grupos/${group.id}/cierre`;
    const attendance = (await call('get', attendancePath).expect(200)).body as {
      revision: string;
    };
    await call('post', attendancePath)
      .send({
        revision: attendance.revision,
        confirmarPendientes: true,
        motivo: 'Cierre sintético B19',
      })
      .expect(201);
    const actPath = `evaluacion/grupos/${group.id}/acta`;
    const act = (await call('get', actPath).expect(200)).body as {
      revision: string;
    };
    await call('post', actPath)
      .send({ revision: act.revision, motivo: 'Acta sintética B19' })
      .expect(201);
  }

  it('lee el grupo completo con revisión independiente de página y no registra exportaciones', async () => {
    const data = await dataset();
    for (let index = 0; index < 2; index++)
      await fixture.enroll(data.group, await fixture.student());
    const before = await evidence(data.group);
    const first = await preview(
      data.group,
      'MATRIZ_NOTAS',
      teacher,
      '&limit=1',
    );
    const second = await preview(
      data.group,
      'MATRIZ_NOTAS',
      teacher,
      `&limit=1&after=${first.nextCursor}`,
    );
    expect(first.resumen).toEqual({
      matriculas: 3,
      aprobados: null,
      desaprobados: null,
      retirados: null,
      resultadosPendientes: 3,
    });
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(second.revision).toBe(first.revision);
    expect(first.items).toHaveLength(1);
    expect(second.items[0]!.matriculaId).not.toBe(first.items[0]!.matriculaId);
    expect(first.puedeExportar).toBe(true);
    expect(await evidence(data.group)).toEqual(before);
    const downloaded = await exported(data.group, first, teacher).expect(201);
    expect(
      (await workbook(downloaded)).worksheets[0]!.getCell('A12').value,
    ).toBe(3);
  });

  it.each(['EN', 'PT'] as const)(
    'genera matriz %s válida: celdas, decimales, cero distinto de pendiente y auditoría sin datos personales',
    async (language) => {
      const data = await dataset(language, '0');
      const pendingStudent = await fixture.student();
      await fixture.enroll(data.group, pendingStudent);
      const view = await preview(data.group);
      const response = await exported(data.group, view, teacher).expect(201);
      const book = await workbook(response);
      expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Matriz']);
      const sheet = book.worksheets[0]!;
      const firstRow = language === 'EN' ? 10 : 9;
      expect(sheet.getCell('A2').value).toMatch(/BORRADOR/);
      expect(sheet.getCell(firstRow, 4).value).toBe(0);
      expect(sheet.getCell(firstRow + 1, 4).value).toBeNull();
      expect(sheet.getCell(firstRow, 6).value).toBe(0);
      expect(sheet.getCell(firstRow, 8).value).toBeNull();
      expect(sheet.getCell(firstRow, 11).value).toBe('Sin confirmar');
      expect(sheet.autoFilter).toBeDefined();
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 3 });
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="BORRADOR-[A-Za-z0-9._-]+[.]xlsx"$/,
      );
      const stored = await evidence(data.group);
      expect(stored.exports).toHaveLength(1);
      expect(stored.audit).toHaveLength(1);
      expect(stored.exports[0]).toMatchObject({
        id: response.headers['x-exportacion-id'],
        tipo: 'MATRIZ_NOTAS',
        grupo_id: data.group.id,
        modo: 'BORRADOR',
        filas: 2,
        revision: view.revision,
        plantilla_sha256: view.plantilla.sha256,
        archivo_sha256: createHash('sha256')
          .update(response.body as Buffer)
          .digest('hex'),
      });
      expect(stored.audit[0]).toMatchObject({
        accion: 'EXPORT_XLSX',
        entidad: 'exportaciones',
        entidad_id: stored.exports[0].id,
      });
      const metadata = JSON.stringify(stored);
      for (const personal of [
        data.student.nombre,
        data.student.documento,
        pendingStudent.documento,
      ])
        expect(metadata).not.toContain(personal);
      expect(Object.keys(stored.exports[0] as object)).not.toContain('archivo');
    },
  );

  it.each(['EN', 'PT'] as const)(
    'genera resumen %s sin inventar aprobados, institución, créditos ni fechas de clases',
    async (language) => {
      const data = await dataset(language, null, false);
      const view = await preview(
        data.group,
        'RESUMEN_PARTICIPANTES',
        coordinator,
      );
      expect(view.puedeExportar).toBe(true);
      expect(view.anexo.aprobados).toBeNull();
      const response = await exported(data.group, view, coordinator).expect(
        201,
      );
      const sheet = (await workbook(response)).getWorksheet('ANEXO N° 05')!;
      expect(sheet.getCell('C11').value).toBe(view.anexo.idioma);
      expect(sheet.getCell('D11').value).toBe(view.anexo.nivel);
      expect(sheet.getCell('K11').value).toBe(1);
      expect(sheet.getCell('L11').value).toBeNull();
      expect(sheet.getCell('B11').value).toBeNull();
      expect(sheet.getCell('E11').value).toBeNull();
      expect(sheet.getCell('F11').value).toBeNull();
      expect(sheet.getCell('I11').value).toEqual(
        new Date(`${view.anexo.fechaInicio}T00:00:00Z`),
      );
      expect(sheet.getCell('A14').value).toMatch(/periodo/);
    },
  );

  it('aplica permisos por tipo, propiedad, sesión y roles mixtos también al historial y al POST', async () => {
    const data = await dataset();
    const view = await preview(data.group);
    for (const actor of [secretary, stranger]) {
      await call('get', `${path(data.group)}?tipo=MATRIZ_NOTAS`, actor).expect(
        403,
      );
      await exported(data.group, view, actor).expect(403);
      await call('get', `${path(data.group)}/exportaciones`, actor).expect(403);
    }
    await call(
      'get',
      `${path(data.group)}?tipo=RESUMEN_PARTICIPANTES`,
      teacher,
    ).expect(403);
    await exported(
      data.group,
      { ...view, tipo: 'RESUMEN_PARTICIPANTES' },
      teacher,
    ).expect(403);
    const unassigned = await fixture.group(false);
    await source.query(
      "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo='SECRETARIA'",
      [fixture.userIds.docente, adminId],
    );
    try {
      await call(
        'get',
        `${path(unassigned)}?tipo=MATRIZ_NOTAS`,
        teacher,
      ).expect(403);
    } finally {
      await source.query(
        "DELETE FROM usuario_roles WHERE usuario_id=$1 AND rol_id=(SELECT id FROM roles WHERE codigo='SECRETARIA')",
        [fixture.userIds.docente],
      );
    }
    await request(app.getHttpServer())
      .get(`/api/v1/${path(data.group)}?tipo=MATRIZ_NOTAS`)
      .expect(401);
    expect(await evidence(data.group)).toEqual({ exports: [], audit: [] });
  });

  it('rechaza CSRF u origen incorrectos sin guardar generación', async () => {
    const data = await dataset();
    const view = await preview(data.group);
    await request(app.getHttpServer())
      .post(`/api/v1/${path(data.group)}/exportaciones`)
      .set('Cookie', admin.cookie)
      .set('Origin', origin)
      .send({ tipo: view.tipo, revision: view.revision })
      .expect(403);
    await call('post', `${path(data.group)}/exportaciones`)
      .set('Origin', 'https://sitio-ajeno.invalid')
      .send({ tipo: view.tipo, revision: view.revision })
      .expect(403);
    expect(await evidence(data.group)).toEqual({ exports: [], audit: [] });
  });

  it('revalida asignación y revocación después de consultar la vista previa', async () => {
    const data = await dataset();
    const view = await preview(data.group, 'MATRIZ_NOTAS', teacher);
    await source.query(
      'UPDATE grupo_docentes SET activo=false WHERE grupo_id=$1',
      [data.group.id],
    );
    await exported(data.group, view, teacher).expect(403);
    await call('get', `${path(data.group)}/exportaciones`, teacher).expect(403);
    const temporary = await login('docente');
    await source.query(
      'UPDATE sesiones_usuario SET revocado_at=now() WHERE usuario_id=$1 AND id=(SELECT id FROM sesiones_usuario WHERE usuario_id=$1 ORDER BY creado_at DESC,id DESC LIMIT 1)',
      [fixture.userIds.docente],
    );
    await exported(data.group, view, temporary).expect(401);
    expect(await evidence(data.group)).toEqual({ exports: [], audit: [] });
  });

  it('rechaza tipos y campos extra; idioma se determina por código y no por nombre', async () => {
    const data = await dataset();
    for (const query of [
      'tipo=OTRO',
      'tipo=MATRIZ_NOTAS&tipo=RESUMEN_PARTICIPANTES',
      'tipo=MATRIZ_NOTAS&oficial=true',
      'tipo=MATRIZ_NOTAS&after=-1',
      'tipo=MATRIZ_NOTAS&limit=101',
    ])
      await call('get', `${path(data.group)}?${query}`).expect(400);
    const view = await preview(data.group);
    await call('post', `${path(data.group)}/exportaciones`)
      .send({ tipo: view.tipo, revision: view.revision, oficial: true })
      .expect(400);
    await call('post', `${path(data.group)}/exportaciones?oficial=true`)
      .send({ tipo: view.tipo, revision: view.revision })
      .expect(400);
    const [language] = await source.query(
      'SELECT idioma_id FROM niveles WHERE id=$1',
      [data.group.nivel_id],
    );
    await source.query("UPDATE idiomas SET codigo='SYN-NO-SOP' WHERE id=$1", [
      language.idioma_id,
    ]);
    try {
      await call('get', `${path(data.group)}?tipo=MATRIZ_NOTAS`).expect(409);
      await exported(data.group, view).expect(409);
    } finally {
      await source.query("UPDATE idiomas SET codigo='DEMO-EN' WHERE id=$1", [
        language.idioma_id,
      ]);
    }
    expect(await evidence(data.group)).toEqual({ exports: [], audit: [] });
  });

  it('bloquea matriz sin criterios aprobados y grupo vacío; el resumen puede quedar pendiente', async () => {
    const empty = await fixture.group();
    const emptyView = await preview(empty, 'RESUMEN_PARTICIPANTES');
    expect(emptyView.puedeExportar).toBe(false);
    await exported(empty, emptyView).expect(409);
    const data = await dataset('EN', null, false);
    const view = await preview(data.group);
    expect(view.puedeExportar).toBe(false);
    expect(view.pendientes.join(' ')).toMatch(/aprobados/);
    await exported(data.group, view).expect(409);
    expect(
      (await preview(data.group, 'RESUMEN_PARTICIPANTES')).puedeExportar,
    ).toBe(true);
  });

  it('rechaza revisión obsoleta por nota, datos de otra página o unidades, y conserva la evidencia intacta', async () => {
    const data = await dataset();
    const first = await preview(data.group, 'MATRIZ_NOTAS', admin, '&limit=1');
    await fixture.enroll(data.group, await fixture.student());
    await exported(data.group, first).expect(409);
    const second = await preview(data.group);
    const [grade] = await source.query(
      'SELECT id,version FROM calificaciones WHERE matricula_id=$1',
      [data.enrollment.id],
    );
    await call(
      'patch',
      `evaluacion/grupos/${data.group.id}/calificaciones`,
      teacher,
    )
      .send({
        registros: [
          {
            matriculaId: data.enrollment.id,
            indicadorId: data.indicatorId,
            nota: '12.50',
            version: grade.version,
          },
        ],
      })
      .expect(200);
    await exported(data.group, second).expect(409);
    const third = await preview(data.group);
    await source.query(
      'UPDATE unidades_didacticas SET creditos=COALESCE(creditos,0)+0.1 WHERE nivel_id=$1',
      [data.group.nivel_id],
    );
    await exported(data.group, third).expect(409);
    expect(await evidence(data.group)).toEqual({ exports: [], audit: [] });
  });

  it('no atribuye confirmación B18 a actas o resultados históricos', async () => {
    const data = await dataset();
    await source.query(
      "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at) VALUES($1,20,20,0,0,0,'APROBADO',now())",
      [data.enrollment.id],
    );
    await insertHistoricalAct(source, data.group.id, adminId);
    const view = await preview(data.group);
    expect(view.resumen).toMatchObject({
      aprobados: null,
      desaprobados: null,
      retirados: null,
      resultadosPendientes: 1,
    });
    const sheet = (await workbook(await exported(data.group, view).expect(201)))
      .worksheets[0]!;
    expect(sheet.getCell('H10').value).toBeNull();
    expect(sheet.getCell('K10').value).toBe('Sin confirmar');
    expect(view.items[0]!.resultado).toBeNull();
    expect(view.advertencias.join(' ')).toMatch(/históricos/);
  });

  it('exporta corrección administrativa actual sin alterar hashes de generaciones anteriores', async () => {
    const data = await dataset();
    await close(data.group);
    const before = await preview(data.group);
    expect(before.resumen).toMatchObject({
      aprobados: 0,
      desaprobados: 1,
      retirados: 0,
      resultadosPendientes: 0,
    });
    const oldFile = await exported(data.group, before).expect(201);
    const detail = (
      await call(
        'get',
        `evaluacion/grupos/${data.group.id}/acta/${data.enrollment.id}`,
      ).expect(200)
    ).body as {
      cierre: { id: string };
      item: { resultado: { version: number } };
      calificaciones: { id: string; version: number }[];
    };
    await call(
      'patch',
      `evaluacion/grupos/${data.group.id}/acta/correccion-nota`,
    )
      .send({
        cierreId: detail.cierre.id,
        matriculaId: data.enrollment.id,
        calificacionId: detail.calificaciones[0]!.id,
        version: detail.calificaciones[0]!.version,
        resultadoVersion: detail.item.resultado.version,
        nota: '12.50',
        motivo: 'Corrección sintética de prueba B19',
      })
      .expect(200);
    await exported(data.group, before).expect(409);
    const after = await preview(data.group);
    expect(after.resumen).toMatchObject({
      aprobados: 1,
      desaprobados: 0,
      retirados: 0,
    });
    const newFile = await exported(data.group, after).expect(201);
    expect((await workbook(oldFile)).worksheets[0]!.getCell('D10').value).toBe(
      12.4,
    );
    expect((await workbook(newFile)).worksheets[0]!.getCell('D10').value).toBe(
      12.5,
    );
    expect((await workbook(newFile)).worksheets[0]!.getCell('F10').value).toBe(
      13,
    );
    expect((await workbook(newFile)).worksheets[0]!.getCell('H10').value).toBe(
      'Aprobado',
    );
    const stored = await evidence(data.group);
    expect(stored.exports).toHaveLength(2);
    expect(stored.exports[0].archivo_sha256).toBe(
      createHash('sha256')
        .update(oldFile.body as Buffer)
        .digest('hex'),
    );
    expect(stored.exports[1].archivo_sha256).not.toBe(
      stored.exports[0].archivo_sha256,
    );
  });

  it('pagina historial sin binarios y filtra tipos del docente por permisos actuales', async () => {
    const data = await dataset();
    await exported(data.group, await preview(data.group)).expect(201);
    await exported(
      data.group,
      await preview(data.group, 'RESUMEN_PARTICIPANTES'),
    ).expect(201);
    await exported(data.group, await preview(data.group)).expect(201);
    const all = await call(
      'get',
      `${path(data.group)}/exportaciones?limit=1`,
    ).expect(200);
    const next = await call(
      'get',
      `${path(data.group)}/exportaciones?limit=1&after=${all.body.nextCursor}`,
    ).expect(200);
    expect(next.body.items[0].tipo).toBe('RESUMEN_PARTICIPANTES');
    const mine = await call(
      'get',
      `${path(data.group)}/exportaciones`,
      teacher,
    ).expect(200);
    expect(mine.body.items).toHaveLength(2);
    expect(
      mine.body.items.every(
        (item: { tipo: string }) => item.tipo === 'MATRIZ_NOTAS',
      ),
    ).toBe(true);
    expect(mine.body.items[0]).not.toHaveProperty('archivo');
    await call(
      'get',
      `${path(data.group)}/exportaciones?tipo=MATRIZ_NOTAS`,
    ).expect(400);
  });

  it.each(['motor', 'registro', 'auditoría'])(
    'un fallo en %s revierte toda evidencia de la generación',
    async (failure) => {
      const data = await dataset();
      const view = await preview(data.group);
      const before = await evidence(data.group);
      if (failure === 'motor')
        vi.spyOn(
          app.get(ReportWorkbookService),
          'render',
        ).mockRejectedValueOnce(new Error('Fallo sintético motor B19'));
      if (failure === 'registro')
        vi.spyOn(app.get(ReportsRepository), 'insert').mockRejectedValueOnce(
          new Error('Fallo sintético registro B19'),
        );
      if (failure === 'auditoría')
        vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
          new Error('Fallo sintético auditoría B19'),
        );
      await exported(data.group, view).expect(500);
      expect(await evidence(data.group)).toEqual(before);
    },
  );

  it('revierte migración vacía; conserva evidencia ante UPDATE DELETE TRUNCATE y down', async () => {
    // La base de datos genérica verifica además las 16 migraciones desde cero y reversión completa vacía.
    const data = await dataset();
    await exported(data.group, await preview(data.group)).expect(201);
    const before = await evidence(data.group);
    for (const sql of [
      'UPDATE exportaciones SET filas=filas',
      'DELETE FROM exportaciones',
      'TRUNCATE exportaciones',
    ])
      await expect(source.query(sql)).rejects.toMatchObject({
        driverError: { code: '23001' },
      });
    await expect(
      checkMigrationReversal(source, new Exportaciones1790208015000()),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(await evidence(data.group)).toEqual(before);
  });

  it.each(['filas', 'indicadores'])(
    'rechaza límite de %s antes de invocar el motor',
    async (cap) => {
      const data = await dataset();
      const repo = app.get(ReportsRepository);
      if (cap === 'filas') {
        const roster = await repo.roster(source.manager, data.group.id);
        const original = repo.roster.bind(repo);
        vi.spyOn(repo, 'roster').mockImplementation((manager, groupId) =>
          groupId === data.group.id
            ? Promise.resolve(Array.from({ length: 5001 }, () => roster[0]!))
            : original(manager, groupId),
        );
      } else {
        const indicators = await repo.indicators(
          source.manager,
          data.configuration!.configuracion.id,
        );
        vi.spyOn(repo, 'indicators').mockResolvedValue(
          Array.from({ length: 101 }, () => indicators[0]!),
        );
      }
      const render = vi.spyOn(app.get(ReportWorkbookService), 'render');
      const view = await preview(data.group);
      expect(view.puedeExportar).toBe(false);
      expect(view.pendientes.join(' ')).toMatch(
        cap === 'filas' ? /5000/ : /100 indicadores/,
      );
      await exported(data.group, view).expect(409);
      expect(render).not.toHaveBeenCalled();
    },
  );

  it('revalida sesión dentro de la transacción aunque la identidad proceda de una consulta anterior', async () => {
    const data = await dataset();
    const view = await preview(data.group);
    await expect(
      app
        .get(ReportsService)
        .export(
          {
            id: adminId,
            sessionId: '999999999999999999',
            nombre_usuario: 'admin_b19',
            roles: ['ADMIN'],
            requiere_cambio_clave: false,
          },
          data.group.id,
          { tipo: view.tipo, revision: view.revision },
        ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
