import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { verify } from 'argon2';
import { databaseOptions } from '../src/database/configuracion/data-source.js';
import { seedDemo } from '../src/database/seed-demo.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { Identidad1790208000000 } from '../src/database/migraciones/1790208000000-identidad.js';
import { OfertaAcademica1790208001000 } from '../src/database/migraciones/1790208001000-oferta-academica.js';
import type { QueryRunner } from 'typeorm';

if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'excel_test') {
  throw new Error('Usa pnpm test:db con la base aislada excel_test');
}

describe('B02 sobre PostgreSQL real', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = new DataSource(databaseOptions());
    await source.initialize();
    expect(await source.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).toEqual([]);
  });
  afterAll(async () => { if (source?.isInitialized) await source.destroy(); });

  it('una migración fallida revierte el esquema completo de esa ejecución', async () => {
    class Fallo1790208000500 {
      async up(runner: QueryRunner) { await runner.query('SELECT 1 / 0'); }
      async down() { /* No llegó a aplicarse. */ }
    }
    const failing = new DataSource({ ...databaseOptions(), migrations: [Identidad1790208000000, Fallo1790208000500] });
    try {
      await failing.initialize();
      await expect(failing.runMigrations()).rejects.toMatchObject({ driverError: { code: '22012' } });
      expect(await source.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`))
        .toEqual([{ tablename: 'migraciones' }]);
      expect(await source.query('SELECT * FROM migraciones')).toEqual([]);
    } finally { await failing.destroy(); }
  });

  it('migra desde cero, siembra cuatro roles y no repite migraciones', async () => {
    expect(await source.runMigrations()).toHaveLength(8);
    expect(await source.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).toHaveLength(26);
    expect(await source.query('SELECT codigo FROM roles ORDER BY codigo')).toEqual([
      { codigo: 'ADMIN' }, { codigo: 'COORDINADOR' }, { codigo: 'DOCENTE' }, { codigo: 'SECRETARIA' },
    ]);
    expect(await source.runMigrations()).toHaveLength(0);
    expect(await source.query('SELECT * FROM usuarios')).toEqual([]);
  });

  it('revierte las seis migraciones y las reaplica desde limpio', async () => {
    for (let i = 0; i < 8; i++) await source.undoLastMigration();
    expect(await source.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`))
      .toEqual([{ tablename: 'migraciones' }]);
    expect(await source.query('SELECT * FROM migraciones')).toEqual([]);
    expect(await source.runMigrations()).toHaveLength(8);
  });

  it('un conflicto en la carga sintética no deja datos parciales', async () => {
    await source.query(`INSERT INTO idiomas (codigo,nombre) VALUES ('CONFLICTO','Inglés de prueba')`);
    await expect(seedDemo(source)).rejects.toMatchObject({ driverError: { code: '23505' } });
    expect(await source.query('SELECT * FROM usuarios')).toEqual([]);
    expect(await source.query('SELECT * FROM personas')).toEqual([]);
    expect(await source.query('SELECT * FROM periodos_academicos')).toEqual([]);
    await source.query(`DELETE FROM idiomas WHERE codigo='CONFLICTO'`);
  });

  it('la carga opcional es sintética, transaccional e idempotente', async () => {
    await seedDemo(source);
    await seedDemo(source);
    expect(await source.query('SELECT codigo FROM idiomas ORDER BY codigo'))
      .toEqual([{ codigo: 'DEMO-EN' }, { codigo: 'DEMO-PT' }]);
    const [user] = await source.query('SELECT activo, password_hash FROM usuarios');
    expect(user.activo).toBe(false);
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    expect(await verify(user.password_hash, 'demo')).toBe(false);
    expect(await source.query('SELECT * FROM grupos')).toHaveLength(2);
    expect(await source.query('SELECT * FROM parametros_academicos')).toHaveLength(1);
  });

  it('arranca AppModule con conexión real y responde salud', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    try {
      configureApp(app);
      await app.init();
      await request(app.getHttpServer()).get('/api/v1/health').expect(200)
        .expect({ status: 'ok', database: 'up' });
    } finally { await app.close(); }
  });

  it.each([
    ['identidad duplicada', `INSERT INTO personas (tipo_documento,numero_documento,nombres,apellido_paterno)
      VALUES ('SINTETICO','DEMO-B02-001','Otro','Sintético')`, '23505'],
    ['perfil huérfano', `INSERT INTO docentes (persona_id,codigo_docente) VALUES (999999,'INVALIDO')`, '23503'],
    ['idioma duplicado', `INSERT INTO idiomas (codigo,nombre) VALUES ('DEMO-EN','Otro')`, '23505'],
    ['orden duplicado', `INSERT INTO niveles (idioma_id,codigo,nombre,orden)
      SELECT id,'OTRO','Otro',1 FROM idiomas WHERE codigo='DEMO-EN'`, '23505'],
    ['prerrequisito de otro idioma', `UPDATE niveles SET prerrequisito_id =
      (SELECT n.id FROM niveles n JOIN idiomas i ON n.idioma_id=i.id WHERE i.codigo='DEMO-PT' AND n.orden=1)
      WHERE codigo='DEMO-2' AND idioma_id=(SELECT id FROM idiomas WHERE codigo='DEMO-EN')`, '23503'],
    ['ciclo de prerrequisitos', `UPDATE niveles SET prerrequisito_id =
      (SELECT n.id FROM niveles n JOIN idiomas i ON n.idioma_id=i.id WHERE i.codigo='DEMO-EN' AND n.orden=2)
      WHERE codigo='DEMO-1' AND idioma_id=(SELECT id FROM idiomas WHERE codigo='DEMO-EN')`, '23514'],
    ['horas negativas', `UPDATE unidades_didacticas SET horas_teoricas=-1`, '23514'],
    ['créditos negativos', `UPDATE unidades_didacticas SET creditos=-0.1`, '23514'],
    ['fechas de periodo invertidas', `UPDATE periodos_academicos SET fecha_fin='2026-01-01'`, '23514'],
    ['fechas de matrícula invertidas', `UPDATE periodos_academicos SET matricula_fin='2026-01-01'`, '23514'],
    ['turno incompleto', `UPDATE turnos SET hora_fin=NULL`, '23514'],
    ['capacidad inválida', `UPDATE grupos SET capacidad=0`, '23514'],
    ['estado inválido', `UPDATE grupos SET estado='INVALIDO'`, '23514'],
    ['grupo duplicado en periodo', `INSERT INTO grupos (periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
      SELECT periodo_id,nivel_id,turno_id,seccion_id,codigo,estado FROM grupos LIMIT 1`, '23505'],
    ['asignación duplicada', `INSERT INTO grupo_docentes SELECT * FROM grupo_docentes LIMIT 1`, '23505'],
    ['versión duplicada', `INSERT INTO parametros_academicos
      (version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
      SELECT version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por
      FROM parametros_academicos`, '23505'],
    ['nota mínima fuera de rango', `INSERT INTO parametros_academicos
      (version,nota_minima,inasistencia_max_pct,tardanzas_por_falta,vigente_desde,creado_por)
      SELECT 2,21,30,3,now(),id FROM usuarios LIMIT 1`, '23514'],
    ['edición retroactiva de parámetros', `UPDATE parametros_academicos SET nota_minima=12`, '23514'],
    ['borrado de versión', `DELETE FROM parametros_academicos`, '23514'],
    ['borrado de idioma referenciado', `DELETE FROM idiomas WHERE codigo='DEMO-EN'`, '23001'],
  ])('rechaza %s en la base', async (_label, sql, code) => {
    await expect(source.query(sql)).rejects.toMatchObject({ driverError: { code } });
  });

  it('inactiva docentes conservando asignaciones y rechaza reactivaciones', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query('UPDATE docentes SET activo=false');
      expect(await runner.query('SELECT * FROM grupo_docentes')).toHaveLength(2);
      await runner.query('UPDATE grupo_docentes SET activo=false');
      await expect(runner.query('UPDATE grupo_docentes SET activo=true')).rejects
        .toMatchObject({ driverError: { code: '23514' } });
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });

  it('conserva grupos al inactivar idioma y admite el mismo código en otro periodo', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query('UPDATE idiomas SET activo=false');
      expect(await runner.query('SELECT * FROM grupos')).toHaveLength(2);
      const [period] = await runner.query(`INSERT INTO periodos_academicos
        (codigo,nombre,fecha_inicio,fecha_fin,matricula_inicio,matricula_fin,estado)
        VALUES ('DEMO-2027','Otro','2027-01-01','2027-03-31','2026-12-01','2026-12-31','PLANIFICADO') RETURNING id`);
      await runner.query(`INSERT INTO grupos (periodo_id,nivel_id,turno_id,seccion_id,codigo,estado)
        SELECT $1,nivel_id,turno_id,seccion_id,codigo,estado FROM grupos LIMIT 1`, [period.id]);
      expect(await runner.query('SELECT * FROM grupos')).toHaveLength(3);
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });

  it('revierte una transacción fallida sin registros parciales', async () => {
    await expect(source.transaction(async (manager) => {
      await manager.query(`INSERT INTO idiomas (codigo,nombre) VALUES ('ROLLBACK','Transitorio')`);
      await manager.query(`INSERT INTO idiomas (codigo,nombre) VALUES ('ROLLBACK','Duplicado')`);
    })).rejects.toMatchObject({ driverError: { code: '23505' } });
    expect(await source.query(`SELECT * FROM idiomas WHERE codigo='ROLLBACK'`)).toEqual([]);
  });

  it('revertir roles asignados falla y conserva los datos e historial', async () => {
    await source.undoLastMigration(); // Reintentos B09 sin matrículas.
    await source.undoLastMigration(); // Protección B08 sin matrículas.
    await source.undoLastMigration(); // Protección B07 sin vouchers.
    await source.undoLastMigration(); // Historial B06 todavía vacío.
    await source.undoLastMigration(); // Acceso todavía sin sesiones ni auditoría en esta suite.
    await expect(source.undoLastMigration()).rejects.toMatchObject({ driverError: { code: '23001' } });
    expect(await source.query('SELECT * FROM roles')).toHaveLength(4);
    expect(await source.query('SELECT * FROM migraciones')).toHaveLength(3);
    expect(await source.runMigrations()).toHaveLength(5);
  });

  it('rechaza revertir tablas que contienen datos', async () => {
    const runner = source.createQueryRunner();
    try {
      await expect(new OfertaAcademica1790208001000().down(runner)).rejects
        .toMatchObject({ driverError: { code: '23514' } });
      await expect(new Identidad1790208000000().down(runner)).rejects
        .toMatchObject({ driverError: { code: '23514' } });
      expect(await source.query('SELECT * FROM grupos')).toHaveLength(2);
    } finally { await runner.release(); }
  });

  it('la carga sintética rechaza producción y la falta de activación explícita', async () => {
    const env = { NODE_ENV: process.env.NODE_ENV, ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED };
    try {
      process.env.NODE_ENV = 'production';
      await expect(seedDemo(source)).rejects.toThrow('entorno no productivo');
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_DEMO_SEED = 'false';
      await expect(seedDemo(source)).rejects.toThrow('ALLOW_DEMO_SEED=true');
    } finally { Object.assign(process.env, env); }
  });
});
