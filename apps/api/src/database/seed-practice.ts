import { pathToFileURL } from 'node:url';
import { DataSource, type EntityManager } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';
import { AuditService } from '../modules/control/audit.service.js';
import { type Identity, type Role } from '../modules/auth/access.js';
import { digest, hashPassword, newToken } from '../modules/auth/security.js';
import { UsersService } from '../modules/usuarios/users.service.js';
import { OfferService } from '../modules/oferta-academica/offer.service.js';
import { OfferRepository } from '../modules/oferta-academica/offer.repository.js';
import { StudentsService } from '../modules/personas/students.service.js';
import { TeachersService } from '../modules/personas/teachers.service.js';
import { seedPracticeAcademics } from './practice/academics.js';
import {
  parsePracticeOptions,
  practiceSeedHelp,
  validatePracticeOptions,
  type PracticeOptions,
} from './practice/options.js';
import type { PracticeGroup, PracticeSummary } from './practice/model.js';

export type { PracticeSummary } from './practice/model.js';

function validateEnvironment(options: PracticeOptions, password: string) {
  validatePracticeOptions(options);
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ALLOW_DEMO_SEED !== 'true'
  )
    throw new Error(
      'La carga sintética requiere ALLOW_DEMO_SEED=true y un entorno no productivo',
    );
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128 ||
    !/\S/.test(password)
  )
    throw new Error(
      'Defina DEMO_SEED_PASSWORD con una contraseña de 12 a 128 caracteres',
    );
}

/** Todos los servicios comparten la transacción del lote, incluidos sus savepoints. */
function transactionalSource(
  source: DataSource,
  manager: EntityManager,
): DataSource {
  const scoped = Object.create(source) as DataSource;
  Object.defineProperty(scoped, 'manager', { value: manager });
  scoped.query = manager.query.bind(manager);
  return scoped;
}

async function seedActor(
  source: DataSource,
  user: { id: string; nombre_usuario: string },
  roles: Role[],
): Promise<Identity> {
  await source.query(
    'UPDATE usuarios SET requiere_cambio_clave=false WHERE id=$1',
    [user.id],
  );
  const [session] = (await source.query(
    `INSERT INTO sesiones_usuario(usuario_id,token_hash,expira_at)
     VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '15 minutes') RETURNING id`,
    [user.id, digest(newToken())],
  )) as { id: string }[];
  return {
    ...user,
    roles,
    requiere_cambio_clave: false,
    sessionId: session!.id,
  };
}

async function ensureRules(
  source: DataSource,
  actor: Identity,
  audit: AuditService,
) {
  const [current] = (await source.query(
    `SELECT id FROM parametros_academicos WHERE vigente_desde<=CURRENT_TIMESTAMP
     AND (vigente_hasta IS NULL OR vigente_hasta>CURRENT_TIMESTAMP)
     ORDER BY vigente_desde DESC,version DESC LIMIT 1`,
  )) as { id: string }[];
  if (current) return;
  const [rules] = (await source.query(
    `INSERT INTO parametros_academicos
     (version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
     SELECT coalesce(max(version),0)+1,13,30,3,'1900-01-01T00:00:00Z',$1
     FROM parametros_academicos RETURNING id,version,nota_minima,inasistencia_max_pct,tardanzas_por_falta`,
    [actor.id],
  )) as { id: string; version: number }[];
  await audit.record({
    usuarioId: actor.id,
    accion: 'SEED_RULES',
    entidad: 'parametros_academicos',
    entidadId: rules!.id,
    nuevo: rules!,
    motivo: 'Reglas 13/30/3 acordadas. Entorno de pruebas manuales.',
  });
}

async function populate(
  source: DataSource,
  options: PracticeOptions,
  password: string,
): Promise<PracticeSummary> {
  const audit = new AuditService(source);
  const users = new UsersService(source, audit);
  const offer = new OfferService(source, new OfferRepository(), audit);
  const studentsService = new StudentsService(source, audit);
  const teachersService = new TeachersService(source, audit);
  const prefix = `DEMO-${options.batch.toUpperCase()}`;
  const [dates] = (await source.query(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS today,
     ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date-$1::int-1)::text AS start,
     ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date+90)::text AS finish,
     ARRAY(SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date-n)::text
       FROM generate_series($1::int-1,0,-1) n) AS sessions`,
    [options.sessions],
  )) as { today: string; start: string; finish: string; sessions: string[] }[];

  // Cuenta técnica sin contraseña conocida. Solo existe para las validaciones
  // de los servicios y queda inactiva al confirmar la carga.
  const [loader] = (await source.query(
    'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave) VALUES($1,$2,false) RETURNING id,nombre_usuario',
    [`seed_${options.batch}_loader`, await hashPassword(newToken())],
  )) as { id: string; nombre_usuario: string }[];
  await source.query(
    "INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$1 FROM roles WHERE codigo='ADMIN' AND activo",
    [loader!.id],
  );
  const admin = await seedActor(source, loader!, ['ADMIN']);
  const actors = [admin];
  const accounts: PracticeSummary['accounts'] = [];
  async function account(suffix: string, roles: Role[], personaId?: string) {
    const user = await users.create(admin, {
      nombreUsuario: `demo_${options.batch}_${suffix}`,
      passwordTemporal: password,
      roles,
      ...(personaId ? { personaId } : {}),
    });
    accounts.push({ username: user.nombre_usuario, roles });
    const actor = await seedActor(source, user, roles);
    actors.push(actor);
    return actor;
  }
  await account('admin', ['ADMIN']);
  const secretary = await account('secretaria', ['SECRETARIA']);
  await account('coordinador', ['COORDINADOR']);
  await ensureRules(source, admin, audit);

  const period = await offer.save(admin, 'periodos', {
    codigo: prefix,
    nombre: `Pruebas manuales ${options.batch} · SINTÉTICO`,
    fechaInicio: dates!.start,
    fechaFin: dates!.finish,
    matriculaInicio: dates!.start,
    matriculaFin: dates!.finish,
    estado: 'ABIERTO',
  });
  const shift = await offer.save(admin, 'turnos', {
    nombre: `${prefix} mañana`,
    horaInicio: '09:00',
    horaFin: '11:00',
  });
  const section = await offer.save(admin, 'secciones', {
    codigo: prefix,
    nombre: `Sección ${options.batch} sintética`,
  });
  const levels: { id: string }[] = [];
  for (const [code, name] of [
    ['EN', 'Inglés'],
    ['PT', 'Portugués'],
  ]) {
    const [existing] = (await source.query(
      'SELECT id,activo FROM idiomas WHERE codigo=$1',
      [`DEMO-${code}`],
    )) as { id: string; activo: boolean }[];
    if (existing && !existing.activo)
      throw new Error(
        `El idioma DEMO-${code} está inactivo. Revíselo antes de cargar otro lote.`,
      );
    const language =
      existing ??
      (await offer.save(admin, 'idiomas', {
        codigo: `DEMO-${code}`,
        nombre: `${name} de prueba`,
      }));
    const [order] = (await source.query(
      'SELECT coalesce(max(orden),0)+1 AS next FROM niveles WHERE idioma_id=$1',
      [language.id],
    )) as { next: number }[];
    const level = await offer.save(admin, 'niveles', {
      idiomaId: language.id,
      codigo: prefix,
      nombre: `Nivel ${options.batch} · SINTÉTICO`,
      orden: order!.next,
    });
    levels.push(level);
    for (let index = 1; index <= 2; index++)
      await offer.save(admin, 'unidades', {
        nivelId: level.id,
        codigo: `SYN-UD${index}`,
        nombre: `Unidad sintética ${index}`,
        horasTeoricas: 2,
        horasPracticas: 2,
        orden: index,
      });
  }
  const teachers: { id: string; actor: Identity }[] = [];
  for (let index = 1; index <= options.teachers; index++) {
    const sequence = String(index).padStart(3, '0');
    const teacher = await teachersService.create(admin, {
      codigoDocente: `${prefix}-D${sequence}`,
      especialidad: 'Inglés y portugués · dato sintético',
      persona: {
        tipoDocumento: 'SINTETICO',
        numeroDocumento: `${prefix}-D${sequence}`,
        nombres: `Docente ${sequence}`,
        apellidoPaterno: 'Sintético',
        apellidoMaterno: options.batch,
      },
    });
    const actor = await account(
      `docente${sequence}`,
      ['DOCENTE'],
      teacher.persona_id,
    );
    teachers.push({ id: teacher.id, actor });
  }
  const groups: PracticeGroup[] = [];
  for (let index = 0; index < options.groups; index++) {
    const teacher = teachers[index % teachers.length]!;
    const group = await offer.save(admin, 'grupos', {
      periodoId: period.id,
      nivelId: levels[index % levels.length]!.id,
      turnoId: shift.id,
      seccionId: section.id,
      codigo: `${prefix}-G${String(index + 1).padStart(3, '0')}`,
      capacidad: Math.ceil(options.students / options.groups) + 5,
      estado: 'ACTIVO',
    });
    await offer.assign(admin, group.id, teacher.id, {
      esTitular: true,
      fechaAsignacion: dates!.start,
      activo: true,
      motivo: 'Asignación sintética para pruebas manuales',
    });
    groups.push({
      id: group.id,
      nivel_id: String(group.nivel_id),
      teacher: teacher.actor,
    });
  }
  const students: { id: string }[] = [];
  for (let index = 1; index <= options.students; index++) {
    const sequence = String(index).padStart(5, '0');
    students.push(
      await studentsService.create(secretary, {
        codigoEstudiante: `${prefix}-E${sequence}`,
        fechaRegistro: dates!.start,
        persona: {
          tipoDocumento: 'SINTETICO',
          numeroDocumento: `${prefix}-E${sequence}`,
          nombres: `Estudiante ${sequence}`,
          apellidoPaterno: 'Sintético',
          apellidoMaterno: options.batch,
          fechaNacimiento: `${2000 + (index % 9)}-01-15`,
          correo: `estudiante${sequence}.${options.batch}@example.invalid`,
        },
      }),
    );
  }
  await seedPracticeAcademics(source, {
    batch: options.batch,
    today: dates!.today,
    sessionDates: dates!.sessions,
    admin,
    secretary,
    groups,
    students,
  });

  const [counts] = (await source.query(
    `SELECT $3::int AS students,$4::int AS teachers,$5::int AS groups,
     (SELECT count(*)::int FROM sesiones_clase WHERE grupo_id=ANY($1::bigint[])) AS sessions,
     (SELECT count(*)::int FROM matriculas WHERE grupo_id=ANY($1::bigint[])) AS enrollments,
     (SELECT count(*)::int FROM vouchers WHERE estudiante_id=ANY($2::bigint[])) AS vouchers,
     (SELECT count(*)::int FROM asistencias WHERE grupo_id=ANY($1::bigint[])) AS attendance,
     (SELECT count(*)::int FROM calificaciones c JOIN matriculas m ON m.id=c.matricula_id WHERE m.grupo_id=ANY($1::bigint[])) AS grades,
     (SELECT count(*)::int FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=ANY($1::bigint[])) AS justifications`,
    [
      groups.map((g) => g.id),
      students.map((s) => s.id),
      options.students,
      options.teachers,
      options.groups,
    ],
  )) as PracticeSummary['counts'][];
  await source.query(
    'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE id=ANY($1::bigint[])',
    [actors.map((a) => a.sessionId)],
  );
  await source.query(
    'UPDATE usuarios SET requiere_cambio_clave=true WHERE id=ANY($1::bigint[])',
    [actors.map((a) => a.id)],
  );
  await source.query('UPDATE usuarios SET activo=false WHERE id=$1', [
    loader!.id,
  ]);
  const summary: PracticeSummary = {
    batch: options.batch,
    created: true,
    accounts,
    counts: counts!,
  };
  await audit.record({
    usuarioId: admin.id,
    accion: 'SEED_PRACTICE_COMPLETE',
    entidad: 'demo_lotes',
    entidadId: options.batch,
    nuevo: { options, summary },
    motivo:
      'Datos sintéticos para pruebas manuales. Cuentas con cambio de contraseña obligatorio y sesiones de carga revocadas.',
  });
  return summary;
}

/** Un lote completo se confirma o revierte; repetirlo conserva la captura manual. */
export async function seedPractice(
  source: DataSource,
  options: PracticeOptions,
  password: string,
): Promise<PracticeSummary> {
  validateEnvironment(options, password);
  return source.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(20260924,50)');
    const [previous] = (await manager.query(
      "SELECT valor_nuevo FROM auditoria_eventos WHERE accion='SEED_PRACTICE_COMPLETE' AND entidad='demo_lotes' AND entidad_id=$1 ORDER BY id LIMIT 1",
      [options.batch],
    )) as {
      valor_nuevo: { options: PracticeOptions; summary: PracticeSummary };
    }[];
    if (previous) {
      const original = previous.valor_nuevo.options;
      if (
        Object.keys(original).some(
          (key) =>
            original[key as keyof PracticeOptions] !==
            options[key as keyof PracticeOptions],
        )
      )
        throw new Error(
          'Este lote ya existe con otras cantidades. Use otro --batch para agregar datos.',
        );
      return { ...previous.valor_nuevo.summary, created: false };
    }
    return populate(transactionalSource(source, manager), options, password);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadEnvironment();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log(practiceSeedHelp);
  else {
    let source: DataSource | undefined;
    try {
      const options = parsePracticeOptions(args);
      const password = process.env.DEMO_SEED_PASSWORD ?? '';
      delete process.env.DEMO_SEED_PASSWORD;
      validateEnvironment(options, password);
      source = createDataSource();
      await source.initialize();
      const summary = await seedPractice(source, options, password);
      console.log(
        summary.created
          ? 'Lote sintético creado.'
          : 'El lote ya existe. Se conservan sus registros y cambios manuales.',
      );
      console.log(JSON.stringify(summary, null, 2));
      console.log(
        'Las cuentas nuevas utilizan DEMO_SEED_PASSWORD y exigen cambiar la contraseña al ingresar.',
      );
    } catch (error) {
      // Los errores SQL incluyen parámetros. Nunca se imprimen hashes ni credenciales.
      console.error(
        error instanceof Error && !('query' in error)
          ? error.message
          : 'No se pudo cargar el lote. La transacción fue revertida. Revise las migraciones y los códigos existentes.',
      );
      process.exitCode = 1;
    } finally {
      if (source?.isInitialized) await source.destroy();
    }
  }
}
