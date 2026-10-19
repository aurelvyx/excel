import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { bootstrapAdministrator } from '../src/database/bootstrap-admin.js';
import { hashPassword } from '../src/modules/auth/security.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AuditService } from '../src/modules/control/audit.service.js';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test')
  throw new Error('Ejecutar B04 con pnpm test:db');
const password = 'Sintetica-segura-2026';
const origin = 'http://127.0.0.1:3000';
type Session = { cookie: string; csrf: string };
const motivo = 'Prueba sintética B04';

describe('B04 oferta y docentes por HTTP sobre PostgreSQL', () => {
  let source: DataSource;
  let app: INestApplication;
  let admin: Session;
  let sequence = 0;
  const unique = () => `B04_${++sequence}`;
  beforeAll(async () => {
    const base = await new DataSource(databaseOptions()).initialize();
    try {
      await base.query('CREATE DATABASE excel_offer_test');
    } finally {
      await base.destroy();
    }
    process.env.DB_NAME = 'excel_offer_test';
    source = await new DataSource(databaseOptions()).initialize();
    await source.runMigrations();
    const adminUser = await bootstrapAdministrator(
      source,
      'admin_oferta',
      password,
    );
    await source.query(
      'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
      [adminUser.id],
    );
    const encoded = await hashPassword(password);
    for (const role of ['DOCENTE', 'SECRETARIA', 'COORDINADOR']) {
      const [user] = await source.query(
        'INSERT INTO usuarios (nombre_usuario,password_hash,requiere_cambio_clave) VALUES ($1,$2,false) RETURNING id',
        [role.toLowerCase(), encoded],
      );
      await source.query(
        'INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
        [user.id, adminUser.id, role],
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
    admin = await login('admin_oferta');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    process.env.DB_NAME = 'excel_test';
  });
  function call(
    method: 'get' | 'post' | 'patch' | 'put',
    path: string,
    session = admin,
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Origin', origin)
      .set('Cookie', session?.cookie ?? '')
      .set('X-CSRF-Token', session?.csrf ?? '')
      .set('X-Requested-With', 'Excel-Web');
  }
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
  async function create(key: string, data: object) {
    return (await call('post', `oferta/${key}`).send(data).expect(201)).body;
  }
  async function fixture() {
    const idioma = await create('idiomas', {
      codigo: unique(),
      nombre: unique(),
    });
    const nivel = await create('niveles', {
      idiomaId: String(idioma.id),
      codigo: unique(),
      nombre: 'Nivel sintético',
      orden: 1,
    });
    const periodo = await create('periodos', {
      codigo: unique(),
      nombre: 'Periodo sintético',
      fechaInicio: '2026-10-01',
      fechaFin: '2026-12-31',
      matriculaInicio: '2026-09-01',
      matriculaFin: '2026-10-01',
      estado: 'ABIERTO',
    });
    const turno = await create('turnos', {
      nombre: unique(),
      horaInicio: '09:00',
      horaFin: '11:00',
    });
    const seccion = await create('secciones', {
      codigo: unique(),
      nombre: 'Sección sintética',
    });
    const context = {
      periodoId: String(periodo.id),
      nivelId: String(nivel.id),
      turnoId: String(turno.id),
      seccionId: String(seccion.id),
    };
    const grupo = await create('grupos', {
      ...context,
      codigo: unique(),
      estado: 'ACTIVO',
    });
    return { idioma, nivel, periodo, turno, seccion, grupo, context };
  }
  async function teacher() {
    return (
      await call('post', 'docentes')
        .send({
          codigoDocente: unique(),
          persona: {
            tipoDocumento: 'DEMO',
            numeroDocumento: unique(),
            nombres: 'Persona sintética',
            apellidoPaterno: 'Prueba',
          },
        })
        .expect(201)
    ).body;
  }
  const assignment = (activo = true) => ({
    esTitular: true,
    fechaAsignacion: '2026-09-25',
    activo,
    motivo,
  });

  it('registra, consulta, modifica e inactiva toda la oferta con auditoría', async () => {
    const f = await fixture();
    const unidad = await create('unidades', {
      nivelId: f.nivel.id,
      codigo: unique(),
      nombre: 'Unidad sintética',
      creditos: '1.5',
      horasTeoricas: 0,
      horasPracticas: 20,
      orden: 1,
    });
    expect(unidad.creditos).toBe('1.5');
    expect(f.grupo.capacidad).toBeNull();
    for (const [key, row] of Object.entries({
      idiomas: f.idioma,
      niveles: f.nivel,
      unidades: unidad,
      periodos: f.periodo,
      turnos: f.turno,
      secciones: f.seccion,
      grupos: f.grupo,
    })) {
      await call('get', `oferta/${key}/${row.id}`).expect(200);
      const change =
        key === 'grupos'
          ? { estado: 'CERRADO' }
          : key === 'periodos'
            ? { estado: 'CERRADO' }
            : { activo: false };
      const edited = await call('patch', `oferta/${key}/${row.id}`)
        .send({ ...change, motivo })
        .expect(200);
      expect(edited.body).toMatchObject(change);
      const listed = await call(
        'get',
        `oferta/${key}?${'activo' in change ? 'activo=false' : 'estado=CERRADO'}&limit=100`,
      ).expect(200);
      expect(
        listed.body.items.some(
          (item: { id: string | number }) => String(item.id) === String(row.id),
        ),
      ).toBe(true);
      const [event] = await source.query(
        'SELECT * FROM auditoria_eventos WHERE entidad_id=$1 AND motivo=$2 ORDER BY id DESC LIMIT 1',
        [String(row.id), motivo],
      );
      expect(event.valor_anterior).toBeTruthy();
      expect(event.valor_nuevo).toBeTruthy();
      expect(event.usuario_id).toBeTruthy();
    }
  });
  it('valida prerrequisitos del mismo idioma, orden, unicidad y referencias', async () => {
    const f = await fixture();
    const second = await create('niveles', {
      idiomaId: String(f.idioma.id),
      codigo: unique(),
      nombre: 'Siguiente',
      orden: 2,
      prerrequisitoId: f.nivel.id,
    });
    await call('patch', `oferta/niveles/${f.nivel.id}`)
      .send({ prerrequisitoId: second.id, motivo })
      .expect(400);
    await call('patch', `oferta/niveles/${second.id}`)
      .send({ prerrequisitoId: second.id, motivo })
      .expect(400);
    const other = await create('idiomas', {
      codigo: unique(),
      nombre: unique(),
    });
    await call('post', 'oferta/niveles')
      .send({
        idiomaId: String(other.id),
        codigo: unique(),
        nombre: 'Ajeno',
        orden: 3,
        prerrequisitoId: f.nivel.id,
      })
      .expect(400);
    await call('post', 'oferta/idiomas')
      .send({ codigo: f.idioma.codigo, nombre: unique() })
      .expect(409);
    await call('post', 'oferta/niveles')
      .send({
        idiomaId: String(f.idioma.id),
        codigo: unique(),
        nombre: 'Duplicado',
        orden: 1,
      })
      .expect(409);
    await call('patch', `oferta/niveles/${second.id}`)
      .send({ prerrequisitoId: null, motivo })
      .expect(200);
    await call('post', 'oferta/niveles')
      .send({
        idiomaId: '99999999',
        codigo: unique(),
        nombre: 'Sin idioma',
        orden: 1,
      })
      .expect(404);
  });
  it('rechaza entradas inválidas, fechas y horas incoherentes y cambios sin motivo', async () => {
    const f = await fixture();
    for (const payload of [
      { nombre: null },
      { activo: null },
      { codigo: '  ' },
      { nombre: 'x', sorpresa: true },
      {},
    ])
      await call('patch', `oferta/idiomas/${f.idioma.id}`)
        .send({ ...payload, motivo })
        .expect(400);
    await call('patch', `oferta/idiomas/${f.idioma.id}`)
      .send({ nombre: 'Cambio' })
      .expect(400);
    await call('patch', `oferta/periodos/${f.periodo.id}`)
      .send({ fechaFin: '2026-02-30', motivo })
      .expect(400);
    await call('patch', `oferta/periodos/${f.periodo.id}`)
      .send({ fechaFin: '2026-01-01', motivo })
      .expect(400);
    await call('patch', `oferta/periodos/${f.periodo.id}`)
      .send({ matriculaFin: '2026-01-01', motivo })
      .expect(400);
    for (const hours of [
      { horaInicio: '12:00' },
      { horaInicio: '25:00' },
      { horaInicio: null },
    ])
      await call('patch', `oferta/turnos/${f.turno.id}`)
        .send({ ...hours, motivo })
        .expect(400);
    await call('patch', `oferta/turnos/${f.turno.id}`)
      .send({ horaInicio: null, horaFin: null, motivo })
      .expect(200);
    for (const creditos of ['1.55', '-1', '1000', 1.5])
      await call('post', 'oferta/unidades')
        .send({
          nivelId: f.nivel.id,
          codigo: unique(),
          nombre: 'Unidad',
          creditos,
          horasTeoricas: 1,
          horasPracticas: 1,
          orden: 1,
        })
        .expect(400);
    await call('patch', `oferta/grupos/${f.grupo.id}`)
      .send({ capacidad: 0, motivo })
      .expect(400);
    for (const query of [
      'limit=101',
      'after=-1',
      'activo=quizas',
      'extra=1',
      'idiomaId=1%20OR%201=1',
    ])
      await call('get', `oferta/niveles?${query}`).expect(400);
    await call('get', 'oferta/grupos/no-id').expect(400);
    await call('get', 'oferta/grupos/99999999').expect(404);
  });
  it('protege el contexto histórico y solo usa referencias disponibles', async () => {
    const f = await fixture();
    const another = await create('secciones', {
      codigo: unique(),
      nombre: 'Otra',
    });
    await call('patch', `oferta/grupos/${f.grupo.id}`)
      .send({ seccionId: String(another.id), motivo })
      .expect(409);
    await call('patch', `oferta/periodos/${f.periodo.id}`)
      .send({ estado: 'PLANIFICADO', motivo })
      .expect(200);
    await call('post', 'oferta/grupos')
      .send({ ...f.context, codigo: unique(), estado: 'ACTIVO' })
      .expect(409);
    await call('post', 'oferta/grupos')
      .send({ ...f.context, codigo: unique() })
      .expect(201);
    await call('patch', `oferta/idiomas/${f.idioma.id}`)
      .send({ activo: false, motivo })
      .expect(200);
    await call('post', 'oferta/grupos')
      .send({ ...f.context, codigo: unique() })
      .expect(409);
    await call('post', 'oferta/niveles')
      .send({
        idiomaId: String(f.idioma.id),
        codigo: unique(),
        nombre: 'Nuevo',
        orden: 2,
      })
      .expect(409);
    await call('get', `oferta/grupos/${f.grupo.id}`).expect(200);
  });
  it('crea una sola identidad docente, permite reutilizar persona y conserva su historial', async () => {
    const doc = await teacher();
    await call('post', 'docentes')
      .send({ codigoDocente: unique(), persona: [] })
      .expect(400);
    await call('patch', `docentes/${doc.id}`)
      .send({ persona: [], motivo })
      .expect(400);
    await call('post', 'docentes')
      .send({
        codigoDocente: unique(),
        persona: { ...doc.persona, id: undefined, activo: undefined },
      })
      .expect(409);
    await call('post', 'docentes')
      .send({ codigoDocente: unique(), personaId: doc.persona_id })
      .expect(409);
    await call('post', 'docentes')
      .send({ codigoDocente: unique() })
      .expect(400);
    await call('post', 'docentes')
      .send({
        codigoDocente: unique(),
        personaId: doc.persona_id,
        persona: {
          tipoDocumento: 'DEMO',
          numeroDocumento: unique(),
          nombres: 'X',
          apellidoPaterno: 'Y',
        },
      })
      .expect(400);
    await call('patch', `docentes/${doc.id}`)
      .send({ persona: { numeroDocumento: 'OTRO' }, motivo })
      .expect(400);
    const updated = await call('patch', `docentes/${doc.id}`)
      .send({
        persona: { nombres: 'Nombre corregido', correo: 'demo@example.test' },
        especialidad: 'Inglés sintético',
        motivo,
      })
      .expect(200);
    expect(updated.body.persona.nombres).toBe('Nombre corregido');
    await call('patch', `docentes/${doc.id}`)
      .send({
        activo: false,
        especialidad: null,
        persona: { correo: null },
        motivo,
      })
      .expect(200);
    const detail = await call('get', `docentes/${doc.id}`).expect(200);
    expect(detail.body.persona.activo).toBe(true);
    expect(detail.body.activo).toBe(false);
    const list = await call(
      'get',
      `docentes?tipoDocumento=DEMO&numeroDocumento=${doc.persona.numeroDocumento}&activo=false`,
    ).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].correo).toBeUndefined();
    const [person] = await source.query(
      "INSERT INTO personas (tipo_documento,numero_documento,nombres,apellido_paterno) VALUES ('DEMO',$1,'Reutilizada','Prueba') RETURNING id",
      [unique()],
    );
    const reused = await call('post', 'docentes')
      .send({ codigoDocente: unique(), personaId: person.id })
      .expect(201);
    expect(reused.body.persona_id).toBe(person.id);
  });
  it('filtra grupos antes de paginar y revoca acceso al inactivar asignación o docente', async () => {
    const f = await fixture();
    const own = await create('grupos', { ...f.context, codigo: unique() });
    const doc = await teacher();
    const [user] = await source.query(
      "SELECT id FROM usuarios WHERE nombre_usuario='docente'",
    );
    await call('patch', `usuarios/${user.id}`)
      .send({ personaId: doc.persona_id, motivo })
      .expect(200);
    const path = `oferta/grupos/${own.id}/docentes/${doc.id}`;
    await call('put', path).send(assignment()).expect(200);
    const session = await login('docente');
    const list = await call('get', 'oferta/grupos?limit=1', session).expect(
      200,
    );
    expect(list.body.items.map((row: { id: string }) => row.id)).toEqual([
      own.id,
    ]);
    await call('get', `oferta/grupos/${own.id}`, session).expect(200);
    await call('get', `oferta/grupos/${f.grupo.id}`, session).expect(403);
    await call('put', path, session).send(assignment()).expect(403);
    await call('put', path).send(assignment(false)).expect(200);
    await call('get', `oferta/grupos/${own.id}`, session).expect(403);
    await call('put', path).send(assignment()).expect(200);
    await call('patch', `docentes/${doc.id}`)
      .send({ activo: false, motivo })
      .expect(200);
    await call('get', `oferta/grupos/${own.id}`, session).expect(403);
    await call('put', path).send(assignment()).expect(409);
    const relations = await call(
      'get',
      `oferta/grupos/${own.id}/docentes`,
    ).expect(200);
    expect(relations.body).toHaveLength(1);
    await call('get', 'auth/me', session).expect(200);
  });
  it('solo el administrador escribe y consulta datos personales de docentes', async () => {
    const f = await fixture();
    for (const role of ['secretaria', 'coordinador', 'docente']) {
      const session = await login(role);
      for (const key of [
        'idiomas',
        'niveles',
        'unidades',
        'periodos',
        'turnos',
        'secciones',
        'grupos',
      ])
        await call('post', `oferta/${key}`, session).send({}).expect(403);
      await call('get', 'docentes', session).expect(403);
      if (role !== 'docente')
        await call('get', `oferta/grupos/${f.grupo.id}`, session).expect(200);
    }
    await request(app.getHttpServer())
      .get('/api/v1/oferta/idiomas')
      .expect(401);
    await call('post', 'oferta/idiomas')
      .set('X-CSRF-Token', 'incorrecto')
      .send({ codigo: unique(), nombre: unique() })
      .expect(403);
  });
  it('rechaza asignaciones a grupos cerrados o docentes inactivos y registra cambios', async () => {
    const f = await fixture();
    const doc = await teacher();
    const path = `oferta/grupos/${f.grupo.id}/docentes/${doc.id}`;
    await call('put', path).send(assignment(false)).expect(400);
    await call('put', path).send(assignment()).expect(200);
    await call('patch', `oferta/grupos/${f.grupo.id}`)
      .send({ estado: 'CERRADO', motivo })
      .expect(200);
    await call('put', path).send(assignment()).expect(409);
    await call('put', path).send(assignment(false)).expect(200);
    const [event] = await source.query(
      "SELECT * FROM auditoria_eventos WHERE entidad='grupo_docentes' AND entidad_id=$1 ORDER BY id DESC LIMIT 1",
      [`${f.grupo.id}:${doc.id}`],
    );
    expect(event.valor_anterior.activo).toBe(true);
    expect(event.valor_nuevo.activo).toBe(false);
    expect(event.motivo).toBe(motivo);
  });
  it('revierte altas y asignaciones completas cuando falla la auditoría', async () => {
    const f = await fixture();
    const doc = await teacher();
    const code = unique();
    vi.spyOn(app.get(AuditService), 'record').mockRejectedValue(
      new Error('Fallo sintético'),
    );
    await call('post', 'oferta/idiomas')
      .send({ codigo: code, nombre: code })
      .expect(500);
    expect(
      await source.query('SELECT id FROM idiomas WHERE codigo=$1', [code]),
    ).toHaveLength(0);
    await call('post', 'docentes')
      .send({
        codigoDocente: code,
        persona: {
          tipoDocumento: 'DEMO',
          numeroDocumento: code,
          nombres: 'Rollback',
          apellidoPaterno: 'Prueba',
        },
      })
      .expect(500);
    expect(
      await source.query('SELECT id FROM personas WHERE numero_documento=$1', [
        code,
      ]),
    ).toHaveLength(0);
    await call('put', `oferta/grupos/${f.grupo.id}/docentes/${doc.id}`)
      .send(assignment())
      .expect(500);
    expect(
      await source.query('SELECT * FROM grupo_docentes WHERE grupo_id=$1', [
        f.grupo.id,
      ]),
    ).toHaveLength(0);
  });
  it('documenta rutas y DTO de oferta, docentes y asignaciones en OpenAPI', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    for (const key of [
      'idiomas',
      'niveles',
      'unidades',
      'periodos',
      'turnos',
      'secciones',
      'grupos',
    ]) {
      expect(
        response.body.paths[`/api/v1/oferta/${key}`].post.requestBody,
      ).toBeDefined();
      expect(
        response.body.paths[`/api/v1/oferta/${key}/{id}`].patch.requestBody,
      ).toBeDefined();
      expect(
        response.body.paths[`/api/v1/oferta/${key}`].get.responses['200']
          .content['application/json'].schema.properties.items,
      ).toBeDefined();
    }
    expect(response.body.components.schemas.UpdateGroupDto.required).toEqual([
      'motivo',
    ]);
    expect(response.body.components.schemas.TeacherDto.required).toEqual([
      'codigoDocente',
    ]);
    expect(
      response.body.paths['/api/v1/oferta/grupos/{id}/docentes/{docenteId}'].put
        .requestBody,
    ).toBeDefined();
  });
  it('asigna varios docentes a un grupo sin duplicar relaciones', async () => {
    const f = await fixture();
    const first = await teacher();
    const second = await teacher();
    for (const doc of [first, second])
      await call('put', `oferta/grupos/${f.grupo.id}/docentes/${doc.id}`)
        .send(assignment())
        .expect(200);
    await call('put', `oferta/grupos/${f.grupo.id}/docentes/${first.id}`)
      .send({ ...assignment(), esTitular: false })
      .expect(200);
    const res = await call(
      'get',
      `oferta/grupos/${f.grupo.id}/docentes`,
    ).expect(200);
    expect(res.body).toHaveLength(2);
    expect(
      res.body.find(
        (row: { docente_id: string }) => row.docente_id === first.id,
      ).es_titular,
    ).toBe(false);
  });
  it('resuelve altas concurrentes duplicadas sin registros parciales', async () => {
    const code = unique();
    const responses = await Promise.all(
      [1, 2].map(() =>
        call('post', 'docentes').send({
          codigoDocente: code,
          persona: {
            tipoDocumento: 'DEMO',
            numeroDocumento: code,
            nombres: 'Concurrente',
            apellidoPaterno: 'Prueba',
          },
        }),
      ),
    );
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(
      await source.query('SELECT id FROM personas WHERE numero_documento=$1', [
        code,
      ]),
    ).toHaveLength(1);
    expect(
      await source.query('SELECT id FROM docentes WHERE codigo_docente=$1', [
        code,
      ]),
    ).toHaveLength(1);
  });
});
