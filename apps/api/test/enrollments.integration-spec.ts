import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { seedDemo } from '../src/database/seed-demo.js';
import { historyFixture } from './student-history.fixture.js';

import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';
import { freePort } from './browser-server.js';
import { randomUUID } from 'node:crypto';
if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B08 con pnpm test:db');
const password = 'Sintetica-segura-B08';
type Session = { cookie: string; csrf: string };
describe('B08 matrícula HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let adminId: string;
  let studentId: string;
  let groupId: string;
  let origin: string;
  let port: number;
  let sequence = 0;
  const previousOrigins = process.env.WEB_ORIGINS;
  const payload = () => ({
    estudianteId: studentId,
    numero: `B08-${++sequence}`,
    fechaPago: '2026-09-28',
    importe: '100.50',
  });
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_enrollments_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_enrollments_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_enrollments',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    const encoded = await hashPassword(password);
    for (const role of ['SECRETARIA', 'DOCENTE', 'COORDINADOR']) {
      const [user] = await source.query(
        'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave) VALUES($1,$2,false) RETURNING id',
        [role.toLowerCase(), encoded],
      );
      await source.query(
        'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, adminId, role],
      );
    }
    const [person] = await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO','B08-PERSONA','Alumno voucher','Sintético') RETURNING id",
    );
    const [student] = await source.query(
      "INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,'SYN-B08','2026-09-28') RETURNING id",
      [person.id],
    );
    studentId = student.id;
    await seedDemo(source);
    await source.query(
      "UPDATE periodos_academicos SET estado='ABIERTO',matricula_inicio=CURRENT_DATE-1,matricula_fin=CURRENT_DATE+1",
    );
    await source.query("UPDATE grupos SET estado='ACTIVO'");
    groupId = (
      await source.query("SELECT id FROM grupos WHERE codigo='DEMO-EN-G1'")
    )[0].id;
  }, 60000);
  beforeEach(async () => {
    port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    process.env.WEB_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await login('admin_enrollments');
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
    method: 'get' | 'post' | 'patch',
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

  async function create(student = studentId, group = groupId) {
    return (
      await call('post', 'matriculas')
        .send({ estudianteId: student, grupoId: group })
        .expect(201)
    ).body;
  }
  it('B09 reintenta la misma alta una vez y rechaza cambiar su identidad o actor', async () => {
    const owner = await student();
    const input = {
      estudianteId: owner,
      grupoId: groupId,
      claveSolicitud: randomUUID(),
    };
    const responses = await Promise.all([
      call('post', 'matriculas').send(input).expect(201),
      call('post', 'matriculas').send(input).expect(201),
    ]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(
      (
        await source.query(
          'SELECT count(*)::int AS n FROM matriculas WHERE clave_solicitud=$1',
          [input.claveSolicitud],
        )
      )[0].n,
    ).toBe(1);
    await call('post', 'matriculas')
      .send({ ...input, estudianteId: await student() })
      .expect(409);
    await call('post', 'matriculas', await login('secretaria'))
      .send(input)
      .expect(409);
    await call('post', 'matriculas')
      .send({ ...input, claveSolicitud: 'invalido' })
      .expect(400);
    const paid = await voucher(owner);
    await activation(responses[0].body.id, paid.id).expect(200);
    expect(
      (await call('post', 'matriculas').send(input).expect(201)).body.estado,
    ).toBe('ACTIVA');
    expect(
      (
        await source.query(
          "SELECT count(*)::int AS n FROM auditoria_eventos WHERE entidad='matriculas' AND entidad_id=$1 AND accion='CREATE'",
          [responses[0].body.id],
        )
      )[0].n,
    ).toBe(1);
  });
  async function voucher(student = studentId, state = 'VALIDADO') {
    const row = (
      await call('post', 'vouchers')
        .send({ ...payload(), estudianteId: student })
        .expect(201)
    ).body;
    if (state !== 'PENDIENTE')
      await call('patch', `vouchers/${row.id}/decision`)
        .send({ estado: state, observacion: 'Prueba sintética B08' })
        .expect(200);
    return row;
  }
  async function student() {
    const [person] = await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO',$1,'Alumno B08','Sintético') RETURNING id",
      [`B08-P-${++sequence}`],
    );
    return (
      await source.query(
        'INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,$2,CURRENT_DATE) RETURNING id',
        [person.id, `B08-E-${sequence}`],
      )
    )[0].id as string;
  }
  const activation = (id: string, voucherId: string, session = admin) =>
    call('patch', `matriculas/${id}/activar`, session).send({
      voucherId,
      confirmado: true,
    });
  it('secretaría confirma un nivel completo con voucher, código, versión y auditoría', async () => {
    const secretary = await login('secretaria');
    const owner = await student();
    const pending = (
      await call('post', 'matriculas', secretary)
        .send({ estudianteId: owner, grupoId: groupId })
        .expect(201)
    ).body;
    expect(pending.estado).toBe('PENDIENTE');
    expect(pending.numero_intento).toBe(1);
    expect(pending.codigo).toMatch(/^MAT-B08-P-[0-9]+-[0-9]+$/);
    expect(pending.voucher_id).toBeNull();
    const paid = await voucher(owner);
    const result = (
      await activation(pending.id, paid.id, secretary).expect(200)
    ).body;
    expect(result.estado).toBe('ACTIVA');
    expect(result.codigo).toBe(pending.codigo);
    expect(result.parametro_id).toBe(pending.parametro_id);
    expect(result.contexto.grupo).toBe('DEMO-EN-G1');
    const audits = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='matriculas' AND entidad_id=$1 ORDER BY id",
      [result.id],
    );
    expect(audits.map((a: { accion: string }) => a.accion)).toEqual([
      'CREATE',
      'ACTIVATE',
    ]);
    expect(audits[1].valor_anterior.estado).toBe('PENDIENTE');
    expect(audits[1].valor_nuevo.voucher_id).toBe(paid.id);
    await activation(pending.id, paid.id).expect(409);
  });
  it('voucher pendiente, rechazado, ajeno o inexistente conserva solicitud pendiente', async () => {
    const row = await create();
    for (const state of ['PENDIENTE', 'RECHAZADO'])
      await activation(row.id, (await voucher(studentId, state)).id).expect(
        409,
      );
    await activation(row.id, (await voucher(await student())).id).expect(409);
    await activation(row.id, '99999999').expect(404);
    const result = (await call('get', `matriculas/${row.id}`).expect(200)).body;
    expect(result.estado).toBe('PENDIENTE');
    expect(result.voucher_id).toBeNull();
  });
  it('solicitudes simultáneas asignan códigos e intentos diferentes', async () => {
    const owner = await student();
    const results = await Promise.all([create(owner), create(owner)]);
    expect(
      results.map((row) => row.numero_intento).sort((a, b) => a - b),
    ).toEqual([1, 2]);
    expect(new Set(results.map((row) => row.codigo)).size).toBe(2);
    await expect(
      source.query("UPDATE matriculas SET codigo='CAMBIADO' WHERE id=$1", [
        results[0].id,
      ]),
    ).rejects.toThrow();
    await expect(source.undoLastMigration()).rejects.toThrow(
      'historial persistido',
    );
  });
  it.each([true, false])(
    'activaciones concurrentes no duplican matrícula (mismo voucher: %s)',
    async (same) => {
      const owner = await student();
      const a = await create(owner);
      const b = await create(owner);
      const va = await voucher(owner);
      const vb = same ? va : await voucher(owner);
      const results = await Promise.all([
        activation(a.id, va.id),
        activation(b.id, vb.id),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      expect(
        (
          await source.query(
            "SELECT count(*)::int AS n FROM matriculas WHERE estudiante_id=$1 AND estado='ACTIVA'",
            [owner],
          )
        )[0].n,
      ).toBe(1);
      await call('post', 'matriculas')
        .send({ estudianteId: owner, grupoId: groupId })
        .expect(409);
    },
  );
  it('no reutiliza un voucher en otro idioma o nivel', async () => {
    const owner = await student();
    const other = (
      await source.query("SELECT id FROM grupos WHERE codigo='DEMO-PT-G1'")
    )[0].id;
    const a = await create(owner);
    const b = await create(owner, other);
    const paid = await voucher(owner);
    await activation(a.id, paid.id).expect(200);
    await activation(b.id, paid.id).expect(409);
  });
  it('serializa la última vacante y conserva pendiente al segundo estudiante', async () => {
    const [group] = await source.query(
      "INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,capacidad,estado) SELECT periodo_id,nivel_id,turno_id,seccion_id,'B08-CUPO',1,'ACTIVO' FROM grupos WHERE id=$1 RETURNING id",
      [groupId],
    );
    const a = await student();
    const b = await student();
    const ma = await create(a, group.id);
    const mb = await create(b, group.id);
    const va = await voucher(a);
    const vb = await voucher(b);
    const results = await Promise.all([
      activation(ma.id, va.id),
      activation(mb.id, vb.id),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      (
        await source.query(
          "SELECT count(*)::int AS n FROM matriculas WHERE grupo_id=$1 AND estado='PENDIENTE' AND voucher_id IS NULL",
          [group.id],
        )
      )[0].n,
    ).toBe(1);
  });
  it('revalida cierre, plazo e inactividad antes de activar', async () => {
    const owner = await student();
    const row = await create(owner);
    const paid = await voucher(owner);
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      groupId,
    ]);
    try {
      await activation(row.id, paid.id).expect(409);
    } finally {
      await source.query("UPDATE grupos SET estado='ACTIVO' WHERE id=$1", [
        groupId,
      ]);
    }
    await source.query(
      'UPDATE periodos_academicos SET matricula_inicio=CURRENT_DATE-3,matricula_fin=CURRENT_DATE-2',
    );
    try {
      await activation(row.id, paid.id).expect(409);
    } finally {
      await source.query(
        'UPDATE periodos_academicos SET matricula_inicio=CURRENT_DATE-1,matricula_fin=CURRENT_DATE+1',
      );
    }
    await source.query('UPDATE estudiantes SET activo=false WHERE id=$1', [
      owner,
    ]);
    try {
      await activation(row.id, paid.id).expect(409);
    } finally {
      await source.query('UPDATE estudiantes SET activo=true WHERE id=$1', [
        owner,
      ]);
    }
  });
  it('prerrequisito exige aprobado confirmado de una matrícula cerrada', async () => {
    const owner = await student();
    await historyFixture(source, owner, adminId);
    const [group] = await source.query(
      "INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado) SELECT g.periodo_id,n.id,g.turno_id,g.seccion_id,'B08-NIVEL2','ACTIVO' FROM grupos g JOIN niveles n ON n.prerrequisito_id=g.nivel_id WHERE g.id=$1 RETURNING id",
      [groupId],
    );
    const input = { estudianteId: owner, grupoId: group.id };
    await call('post', 'matriculas').send(input).expect(409);
    await source.query(
      "UPDATE resultados_academicos SET condicion='APROBADO',nota_oficial=13 WHERE matricula_id IN (SELECT id FROM matriculas WHERE estudiante_id=$1 AND estado='CERRADA')",
      [owner],
    );
    await call('post', 'matriculas').send(input).expect(409);
    await source.query(
      "UPDATE resultados_academicos SET confirmado_at=now() WHERE matricula_id IN (SELECT id FROM matriculas WHERE estudiante_id=$1 AND estado='CERRADA')",
      [owner],
    );
    const row = await create(owner, group.id);
    await activation(row.id, (await voucher(owner)).id).expect(200);
  });
  it('repetir nivel conserva asistencia, notas y resultado del historial', async () => {
    const owner = await student();
    await historyFixture(source, owner, adminId);
    const snapshot = async () =>
      Promise.all(
        ['asistencias', 'calificaciones', 'resultados_academicos'].map(
          (table) =>
            source.query(
              `SELECT row_to_json(a) AS row FROM ${table} a JOIN matriculas m ON m.id=a.matricula_id WHERE m.estudiante_id=$1 ORDER BY a.id`,
              [owner],
            ),
        ),
      );
    const before = await snapshot();
    const row = await create(owner);
    expect(row.numero_intento).toBe(3);
    await activation(row.id, (await voucher(owner)).id).expect(200);
    expect(await snapshot()).toEqual(before);
  });
  it('auditoría fallida revierte alta y activación sin consumir voucher ni intento', async () => {
    const owner = await student();
    const pending = await create(owner);
    const paid = await voucher(owner);
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('Fallo sintético'));
    await activation(pending.id, paid.id).expect(500);
    await call('post', 'matriculas')
      .send({ estudianteId: owner, grupoId: groupId })
      .expect(500);
    const row = (await call('get', `matriculas/${pending.id}`).expect(200))
      .body;
    expect(row.estado).toBe('PENDIENTE');
    expect(row.voucher_id).toBeNull();
    spy.mockRestore();
    expect((await create(owner)).numero_intento).toBe(2);
    await activation(pending.id, paid.id).expect(200);
  });
  it('protege roles, campos calculados y confirmación explícita', async () => {
    const row = await create();
    const paid = await voucher();
    await request(app.getHttpServer())
      .get(`/api/v1/matriculas/${row.id}`)
      .expect(401);
    for (const role of ['docente', 'coordinador']) {
      const user = await login(role);
      await call('get', `matriculas/${row.id}`, user).expect(403);
      await call('post', 'matriculas', user)
        .send({ estudianteId: studentId, grupoId: groupId })
        .expect(403);
      await activation(row.id, paid.id, user).expect(403);
    }
    await call('post', 'matriculas')
      .send({ estudianteId: studentId, grupoId: groupId, numeroIntento: 1 })
      .expect(400);
    await call('patch', `matriculas/${row.id}/activar`)
      .send({ voucherId: paid.id, confirmado: false })
      .expect(400);
    await call('get', 'matriculas/no-id').expect(400);
  });
  it('conserva versión del intento ante nueva configuración y expone OpenAPI', async () => {
    const owner = await student();
    const row = await create(owner);
    await source.query(
      'INSERT INTO parametros_academicos(version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por) VALUES(2,13,30,3,now(),$1)',
      [adminId],
    );
    const next = await create(owner);
    expect(next.version_reglas).toBe(2);
    expect(row.version_reglas).toBe(1);
    const active = (
      await activation(row.id, (await voucher(owner)).id).expect(200)
    ).body;
    expect(active.parametro_id).toBe(row.parametro_id);
    const spec = (
      await request(app.getHttpServer()).get('/api/openapi.json').expect(200)
    ).body;
    expect(spec.paths['/api/v1/matriculas/{id}/activar'].patch).toBeDefined();
  });
});
