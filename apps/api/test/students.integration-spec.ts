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
import { historyFixture } from './student-history.fixture.js';
if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B06 con pnpm test:db');
const password = 'Sintetica-segura-B06';
const origin = 'http://127.0.0.1:3000';
type Session = { cookie: string; csrf: string };
describe('B06 estudiantes e historial HTTP y PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let adminId: string;
  let sequence = 0;
  const unique = () => `B06-${++sequence}`;
  const payload = () => ({
    codigoEstudiante: unique(),
    fechaRegistro: '2026-09-27',
    persona: {
      tipoDocumento: 'SINTETICO',
      numeroDocumento: unique(),
      nombres: 'Estudiante sintético',
      apellidoPaterno: 'Prueba',
      correo: 'sintetico@example.invalid',
      telefono: '000000000',
    },
  });
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_students_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_students_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const actor = await bootstrapAdministrator(
      source,
      'admin_students',
      password,
    );
    adminId = actor.id;
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminId],
    );
    await seedDemo(source);
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
  });
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await login('admin_students');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
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
      [method](`/api/v1/estudiantes${path}`)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .set('X-Requested-With', 'Excel-Web');
  }
  const create = async () =>
    (await call('post', '').send(payload()).expect(201)).body;
  it('secretaría registra y actualiza datos con identidad inmutable y auditoría', async () => {
    const secretary = await login('secretaria');
    const input = payload();
    const row = (await call('post', '', secretary).send(input).expect(201))
      .body;
    const updated = (
      await call('patch', `/${row.id}`, secretary)
        .send({
          persona: { nombres: 'Nombre corregido', correo: null },
          activo: false,
          motivo: 'Corrección sintética',
        })
        .expect(200)
    ).body;
    expect(updated.persona.nombres).toBe('Nombre corregido');
    expect(updated.persona.correo).toBeNull();
    expect(updated.codigo_estudiante).toBe(input.codigoEstudiante);
    expect(updated.fecha_registro).toBe('2026-09-27');
    expect(updated.activo).toBe(false);
    const [audit] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='estudiantes' AND entidad_id=$1 ORDER BY id DESC LIMIT 1",
      [row.id],
    );
    expect(audit.valor_anterior.activo).toBe(true);
    expect(audit.valor_nuevo.activo).toBe(false);
    expect(audit.motivo).toBe('Corrección sintética');
    expect(audit.usuario_id).toBeTruthy();
    expect(audit.ocurrido_at).toBeDefined();
    for (const body of [
      { codigoEstudiante: 'OTRO' },
      { persona: { numeroDocumento: 'OTRO' } },
      { fechaRegistro: '2025-01-01' },
    ])
      await call('patch', `/${row.id}`, secretary)
        .send({ ...body, motivo: 'Sintético' })
        .expect(400);
    expect(
      (await call('get', `/${row.id}/historial`).expect(200)).body.items,
    ).toEqual([]);
  });
  it('detecta documento antes del alta y bloquea duplicados concurrentes sin personas huérfanas', async () => {
    const input = payload();
    const results = await Promise.all([
      call('post', '').send(input),
      call('post', '').send({ ...input, codigoEstudiante: unique() }),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const lookup = (
      await call(
        'get',
        `/documento?${new URLSearchParams({ tipoDocumento: input.persona.tipoDocumento, numeroDocumento: input.persona.numeroDocumento })}`,
      ).expect(200)
    ).body;
    expect(lookup.encontrado).toBe(true);
    expect(lookup.registro.estudiante_id).toBeTruthy();
    await call('post', '')
      .send({
        ...input,
        codigoEstudiante: unique(),
        persona: {
          ...input.persona,
          numeroDocumento: ` ${input.persona.numeroDocumento} `,
        },
      })
      .expect(409);
    const other = payload();
    await call('post', '')
      .send({ ...other, codigoEstudiante: input.codigoEstudiante })
      .expect(409);
    expect(
      await source.query('SELECT id FROM personas WHERE numero_documento=$1', [
        other.persona.numeroDocumento,
      ]),
    ).toEqual([]);
  });
  it('reutiliza persona docente y conserva un único registro de identidad', async () => {
    const [person] = await source.query(
      "SELECT persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
    );
    const row = (
      await call('post', '')
        .send({
          personaId: person.persona_id,
          codigoEstudiante: unique(),
          fechaRegistro: '2026-09-27',
        })
        .expect(201)
    ).body;
    expect(row.persona_id).toBe(person.persona_id);
    await call('post', '')
      .send({
        personaId: person.persona_id,
        codigoEstudiante: unique(),
        fechaRegistro: '2026-09-27',
      })
      .expect(409);
  });
  it('busca nombre, documento y código con paginación, filtros y caracteres literales', async () => {
    const input = payload();
    const row = (await call('post', '').send(input).expect(201)).body;
    for (const q of [
      input.codigoEstudiante,
      input.persona.numeroDocumento,
      'Prueba Estudiante sintético',
    ])
      expect(
        (
          await call('get', `?${new URLSearchParams({ q })}`).expect(200)
        ).body.items.map((r: { id: string }) => r.id),
      ).toContain(row.id);
    expect((await call('get', '?q=%25').expect(200)).body.items).toEqual([]);
    expect(
      (await call('get', '?q=%27%20OR%201%3D1--').expect(200)).body.items,
    ).toEqual([]);
    const first = (await call('get', '?limit=1').expect(200)).body;
    expect(first.items).toHaveLength(1);
    const next = (
      await call('get', `?limit=1&after=${first.nextCursor}`).expect(200)
    ).body;
    expect(next.items[0].id).not.toBe(first.items[0].id);
    await call('patch', `/${row.id}`)
      .send({ activo: false, motivo: 'Sintético' })
      .expect(200);
    expect(
      (
        await call('get', `?activo=true&q=${input.codigoEstudiante}`).expect(
          200,
        )
      ).body.items,
    ).toEqual([]);
    for (const query of [
      'limit=101',
      'q=',
      'activo=otro',
      'q=a&q=b',
      'desconocido=1',
    ])
      await call('get', `?${query}`).expect(400);
  });
  it('valida DTO, fechas, referencias y modificaciones vacías', async () => {
    const input = payload();
    for (const body of [
      { ...input, persona: null },
      { ...input, persona: [] },
      { ...input, fechaRegistro: '2026-02-30' },
      { ...input, persona: { ...input.persona, nombres: '' } },
      { ...input, personaId: '1' },
      { ...input, activo: true },
    ])
      await call('post', '').send(body).expect(400);
    await call('post', '')
      .send({
        personaId: '999999',
        codigoEstudiante: unique(),
        fechaRegistro: '2026-09-27',
      })
      .expect(404);
    const row = await create();
    await call('patch', `/${row.id}`)
      .send({ motivo: 'Sin cambios' })
      .expect(400);
    await call('patch', `/${row.id}`).send({ activo: false }).expect(400);
  });
  it('deniega docente y anónimo; coordinación consulta sin contactos ni edición', async () => {
    const row = await create();
    const teacher = await login('docente');
    const coordinator = await login('coordinador');
    for (const path of [
      '',
      `/${row.id}`,
      `/${row.id}/historial`,
      `/${row.id}/historial/1`,
      '/documento?tipoDocumento=DNI&numeroDocumento=1',
    ])
      await call('get', path, teacher).expect(403);
    await request(app.getHttpServer()).get('/api/v1/estudiantes').expect(401);
    const read = (await call('get', `/${row.id}`, coordinator).expect(200))
      .body;
    expect(read.persona).not.toHaveProperty('correo');
    expect(read.persona).not.toHaveProperty('telefono');
    expect(read.persona).not.toHaveProperty('fechaNacimiento');
    await call('post', '', coordinator).send(payload()).expect(403);
    await call('patch', `/${row.id}`, coordinator)
      .send({ activo: false, motivo: 'Sintético' })
      .expect(403);
    await call(
      'get',
      '/documento?tipoDocumento=DNI&numeroDocumento=1',
      coordinator,
    ).expect(403);
  });
  it('revierte persona, estudiante y auditoría si falla el registro de eventos', async () => {
    const input = payload();
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new Error('Fallo sintético'),
    );
    await call('post', '').send(input).expect(500);
    expect(
      await source.query('SELECT id FROM personas WHERE numero_documento=$1', [
        input.persona.numeroDocumento,
      ]),
    ).toEqual([]);
  });
  it('separa dos intentos persistidos, conserva historial inactivo y distingue cero de pendiente', async () => {
    const row = await create();
    const other = await create();
    const f = await historyFixture(source, row.id, adminId);
    const [first, second] = f.attempts;
    const history = (await call('get', `/${row.id}/historial`).expect(200))
      .body;
    expect(
      history.items.map((r: { numero_intento: number }) => r.numero_intento),
    ).toEqual([1, 2]);
    expect(history.items[0].resultado.notaOficial).toBe(12);
    expect(history.items[1].resultado).toBeNull();
    const a = (
      await call('get', `/${row.id}/historial/${first.id}`).expect(200)
    ).body;
    const b = (
      await call('get', `/${row.id}/historial/${second.id}`).expect(200)
    ).body;
    expect(a.asistencias[0].codigo).toBe('F');
    expect(b.asistencias[0].codigo).toBe('P');
    expect(a.notas.map((n: { nota: string }) => n.nota)).toEqual([
      '12.40',
      '12.40',
    ]);
    expect(b.notas.map((n: { nota: string | null }) => n.nota)).toEqual([
      '0.00',
      null,
    ]);
    await call('get', `/${other.id}/historial/${first.id}`).expect(404);
    expect(
      (
        await call(
          'get',
          `/${row.id}/historial?periodoId=${f.period.id}`,
        ).expect(200)
      ).body.items,
    ).toHaveLength(1);
    await call('patch', `/${row.id}`)
      .send({ activo: false, motivo: 'Sintético' })
      .expect(200);
    await source.query("UPDATE grupos SET estado='CERRADO' WHERE id=$1", [
      f.group.id,
    ]);
    expect(
      (await call('get', `/${row.id}/historial/${first.id}`).expect(200)).body,
    ).toEqual(a);
    await expect(
      source.query('DELETE FROM matriculas WHERE id=$1', [first.id]),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(
      source.query('UPDATE matriculas SET numero_intento=3 WHERE id=$1', [
        second.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
    await expect(source.undoLastMigration()).rejects.toThrow(
      'historial persistido',
    );
  });
  it('integridad: nota inválida, cruce de grupos y voucher pendiente no generan historial inconsistente', async () => {
    const [grade] = await source.query('SELECT * FROM calificaciones LIMIT 1');
    for (const note of [-1, 21])
      await expect(
        source.query('UPDATE calificaciones SET nota=$1 WHERE id=$2', [
          note,
          grade.id,
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const [other] = await source.query(
      'SELECT id FROM grupos WHERE id<>$1 LIMIT 1',
      [grade.grupo_id],
    );
    await expect(
      source.query('UPDATE calificaciones SET grupo_id=$1 WHERE id=$2', [
        other.id,
        grade.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    const row = await create();
    const [group] = await source.query(
      'SELECT id,nivel_id FROM grupos LIMIT 1',
    );
    const [param] = await source.query(
      'SELECT id FROM parametros_academicos LIMIT 1',
    );
    const [v] = await source.query(
      "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe) VALUES($1,$2,'2026-09-27',1) RETURNING id",
      [row.id, unique()],
    );
    await expect(
      source.query(
        "INSERT INTO matriculas(codigo,estudiante_id,grupo_id,nivel_id,voucher_id,parametro_id,numero_intento,fecha_matricula,estado,registrado_por) VALUES($1,$2,$3,$4,$5,$6,1,'2026-09-27','ACTIVA',$7)",
        [unique(), row.id, group.id, group.nivel_id, v.id, param.id, adminId],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
});
