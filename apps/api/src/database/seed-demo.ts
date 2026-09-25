import { randomBytes } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import type { DataSource } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';
import { pathToFileURL } from 'node:url';

export async function seedDemo(source: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('La carga sintética requiere ALLOW_DEMO_SEED=true y un entorno no productivo');
  }
  const passwordHash = await hash(randomBytes(32), { type: argon2id });
  await source.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(20260924, 3)');
    const existing: unknown[] = await manager.query("SELECT id FROM usuarios WHERE nombre_usuario = 'demo_b02_inactivo'");
    if (existing.length) return;
    // Nunca habilitar esta cuenta: no se publica ni conserva su contraseña aleatoria.
    const [user] = await manager.query(`INSERT INTO usuarios
      (nombre_usuario, password_hash, activo) VALUES ('demo_b02_inactivo', $1, false) RETURNING id`, [passwordHash]) as { id: string }[];
    await manager.query(`INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por)
      SELECT $1, id, $1 FROM roles WHERE codigo = 'ADMIN'`, [user!.id]);
    const [person] = await manager.query(`INSERT INTO personas
      (tipo_documento, numero_documento, nombres, apellido_paterno)
      VALUES ('SINTETICO','DEMO-B02-001','Docente de prueba','Sintético') RETURNING id`) as { id: string }[];
    const [teacher] = await manager.query(`INSERT INTO docentes (persona_id, codigo_docente)
      VALUES ($1, 'DEMO-DOC-001') RETURNING id`, [person!.id]) as { id: string }[];
    const [period] = await manager.query(`INSERT INTO periodos_academicos
      (codigo, nombre, fecha_inicio, fecha_fin, matricula_inicio, matricula_fin, estado)
      VALUES ('DEMO-2026','Periodo sintético B02','2026-10-01','2026-12-31','2026-09-01','2026-10-01','PLANIFICADO')
      RETURNING id`) as { id: string }[];
    const [shift] = await manager.query(`INSERT INTO turnos (nombre, hora_inicio, hora_fin)
      VALUES ('Turno sintético B02','09:00','11:00') RETURNING id`) as { id: number }[];
    const [section] = await manager.query(`INSERT INTO secciones (codigo, nombre)
      VALUES ('DEMO-A','Sección sintética A') RETURNING id`) as { id: number }[];
    for (const [code, language] of [['DEMO-EN','Inglés de prueba'], ['DEMO-PT','Portugués de prueba']]) {
      const [idioma] = await manager.query(`INSERT INTO idiomas (codigo, nombre) VALUES ($1,$2) RETURNING id`, [code, language]) as { id: number }[];
      const [level] = await manager.query(`INSERT INTO niveles (idioma_id, codigo, nombre, orden)
        VALUES ($1,'DEMO-1','Nivel sintético 1',1) RETURNING id`, [idioma!.id]) as { id: string }[];
      await manager.query(`INSERT INTO niveles (idioma_id, codigo, nombre, orden, prerrequisito_id)
        VALUES ($1,'DEMO-2','Nivel sintético 2',2,$2)`, [idioma!.id, level!.id]);
      await manager.query(`INSERT INTO unidades_didacticas
        (nivel_id, codigo, nombre, creditos, horas_teoricas, horas_practicas, orden)
        VALUES ($1,'DEMO-UD','Unidad sintética',1.0,2,2,1)`, [level!.id]);
      const [group] = await manager.query(`INSERT INTO grupos
        (periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
        VALUES ($1,$2,$3,$4,$5,'PLANIFICADO') RETURNING id`,
      [period!.id, level!.id, shift!.id, section!.id, `${code}-G1`]) as { id: string }[];
      await manager.query(`INSERT INTO grupo_docentes (grupo_id,docente_id,es_titular,fecha_asignacion)
        VALUES ($1,$2,true,'2026-09-24')`, [group!.id, teacher!.id]);
    }
    await manager.query(`INSERT INTO parametros_academicos
      (version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
      VALUES (1,13.00,30.00,3,'2026-09-24T00:00:00Z',$1)`, [user!.id]);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvironment();
  const source = createDataSource();
  try {
    await source.initialize();
    await seedDemo(source);
    console.log('Carga sintética B02 disponible (cuenta deshabilitada)');
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
