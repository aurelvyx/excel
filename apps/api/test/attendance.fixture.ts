import type { DataSource } from 'typeorm';
import { seedDemo } from '../src/database/seed-demo.js';
import { hashPassword } from '../src/modules/auth/security.js';

export type AttendanceFixtureGroup = {
  id: string;
  periodo_id: string;
  nivel_id: string;
  codigo: string;
};
export type AttendanceFixtureSession = {
  id: string;
  grupo_id: string;
  fecha: string;
  estado: string;
};
export type AttendanceFixtureStudent = {
  id: string;
  nombre: string;
  documento: string;
  persona_id: string;
};
export type AttendanceFixtureEnrollment = {
  id: string;
  estudiante_id: string;
  grupo_id: string;
  codigo: string;
  numero_intento: number;
};

/** Únicamente fixtures sintéticos para las bases aisladas de pnpm test:db. */
export async function attendanceFixture(
  source: DataSource,
  adminId: string,
  password: string,
) {
  if (
    process.env.NODE_ENV !== 'test' ||
    !/^excel_attendance(_calculation)?(_web)?_test$/.test(
      process.env.DB_NAME ?? '',
    )
  )
    throw new Error(
      'El fixture de asistencia requiere una base aislada de pruebas',
    );
  await seedDemo(source);
  const [teacher] = (await source.query(
    "SELECT id,persona_id FROM docentes WHERE codigo_docente='DEMO-DOC-001'",
  )) as { id: string; persona_id: string }[];
  const [secondPerson] = (await source.query(
    "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO','SYN-B12-DOC-002','Segundo docente B12','Sintético') RETURNING id",
  )) as { id: string }[];
  const [secondTeacher] = (await source.query(
    "INSERT INTO docentes(persona_id,codigo_docente) VALUES($1,'SYN-B12-DOC-002') RETURNING id",
    [secondPerson!.id],
  )) as { id: string }[];
  const encoded = await hashPassword(password);
  const userIds: Record<string, string> = {};
  for (const name of [
    'docente',
    'docente2',
    'ajeno',
    'secretaria',
    'coordinador',
  ]) {
    const [user] = (await source.query(
      'INSERT INTO usuarios(nombre_usuario,password_hash,requiere_cambio_clave,persona_id) VALUES($1,$2,false,$3) RETURNING id',
      [
        name,
        encoded,
        name === 'docente'
          ? teacher!.persona_id
          : name === 'docente2'
            ? secondPerson!.id
            : null,
      ],
    )) as { id: string }[];
    userIds[name] = user!.id;
    await source.query(
      'INSERT INTO usuario_roles(usuario_id,rol_id,asignado_por) SELECT $1,id,$2 FROM roles WHERE codigo=$3',
      [
        user!.id,
        adminId,
        name === 'ajeno' || name.startsWith('docente')
          ? 'DOCENTE'
          : name.toUpperCase(),
      ],
    );
  }
  const [dates] = (await source.query(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS hoy,
     ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date+1)::text AS manana,
     ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date-1)::text AS ayer`,
  )) as { hoy: string; manana: string; ayer: string }[];
  const [parameter] = (await source.query(
    'SELECT id FROM parametros_academicos ORDER BY id LIMIT 1',
  )) as { id: string }[];
  let sequence = 0;
  const unique = () => `SYN-B12-${++sequence}`;
  async function group(assigned = true): Promise<AttendanceFixtureGroup> {
    const code = unique();
    const [period] = (await source.query(
      `INSERT INTO periodos_academicos(codigo,nombre,fecha_inicio,fecha_fin,matricula_inicio,matricula_fin,estado)
       VALUES($1,$1,$2::date-INTERVAL '1 year',$2::date+INTERVAL '1 year',$2::date-10,$2::date+10,'ABIERTO') RETURNING id`,
      [code, dates!.hoy],
    )) as { id: string }[];
    const [row] = (await source.query(
      `INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
       SELECT $1,nivel_id,turno_id,seccion_id,$2,'ACTIVO' FROM grupos WHERE codigo='DEMO-EN-G1' RETURNING id,periodo_id,nivel_id,codigo`,
      [period!.id, code],
    )) as AttendanceFixtureGroup[];
    if (assigned)
      for (const id of [teacher!.id, secondTeacher!.id])
        await source.query(
          'INSERT INTO grupo_docentes(grupo_id,docente_id,fecha_asignacion,activo) VALUES($1,$2,$3,true)',
          [row!.id, id, dates!.ayer],
        );
    return row!;
  }
  async function student(): Promise<AttendanceFixtureStudent> {
    const document = unique();
    const name = `Estudiante B12 ${sequence}`;
    const [person] = (await source.query(
      "INSERT INTO personas(tipo_documento,numero_documento,nombres,apellido_paterno) VALUES('SINTETICO',$1,$2,'Sintético') RETURNING id",
      [document, name],
    )) as { id: string }[];
    const [row] = (await source.query(
      'INSERT INTO estudiantes(persona_id,codigo_estudiante,fecha_registro) VALUES($1,$2,$3) RETURNING id',
      [person!.id, document, dates!.ayer],
    )) as { id: string }[];
    return {
      id: row!.id,
      nombre: `Sintético ${name}`,
      documento: document,
      persona_id: person!.id,
    };
  }
  async function enroll(
    g: AttendanceFixtureGroup,
    owner: AttendanceFixtureStudent,
    state: 'ACTIVA' | 'PENDIENTE' | 'CERRADA' | 'ANULADA' = 'ACTIVA',
    parametroId = parameter!.id,
  ): Promise<AttendanceFixtureEnrollment> {
    const code = unique();
    const [attempt] = (await source.query(
      'SELECT COALESCE(max(numero_intento),0)+1 AS n FROM matriculas WHERE estudiante_id=$1 AND nivel_id=$2',
      [owner.id, g.nivel_id],
    )) as { n: number }[];
    let voucherId: string | null = null;
    if (state === 'ACTIVA' || state === 'CERRADA') {
      const [voucher] = (await source.query(
        "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe,estado,validado_por,validado_at) VALUES($1,$2,$3,100.50,'VALIDADO',$4,now()) RETURNING id",
        [owner.id, `${code}-V`, dates!.ayer, adminId],
      )) as { id: string }[];
      voucherId = voucher!.id;
    }
    const [row] = (await source.query(
      `INSERT INTO matriculas(codigo,estudiante_id,grupo_id,nivel_id,voucher_id,parametro_id,numero_intento,fecha_matricula,estado,registrado_por,motivo_anulacion)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,estudiante_id,grupo_id,codigo,numero_intento`,
      [
        code,
        owner.id,
        g.id,
        g.nivel_id,
        voucherId,
        parametroId,
        attempt!.n,
        dates!.ayer,
        state,
        adminId,
        state === 'ANULADA' ? 'Anulación sintética B12' : null,
      ],
    )) as AttendanceFixtureEnrollment[];
    return row!;
  }
  async function session(
    g: AttendanceFixtureGroup,
    state = 'PROGRAMADA',
    date = dates!.hoy,
  ): Promise<AttendanceFixtureSession> {
    const [row] = (await source.query(
      'INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,$3,$4) RETURNING id,grupo_id,fecha::text,estado',
      [g.id, date, state, adminId],
    )) as AttendanceFixtureSession[];
    return row!;
  }
  return {
    group,
    student,
    enroll,
    session,
    userIds,
    teacherId: teacher!.id,
    teacherPersonId: teacher!.persona_id,
    today: dates!.hoy,
    tomorrow: dates!.manana,
    yesterday: dates!.ayer,
  };
}

export type AttendanceFixtures = Awaited<ReturnType<typeof attendanceFixture>>;
