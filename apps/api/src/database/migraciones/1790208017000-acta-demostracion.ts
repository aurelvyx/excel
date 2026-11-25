import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B19: recupera el diseño de acta del PR21 como una exportación de demostración. */
export class ActaDemostracion1790208017000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE exportaciones DROP CONSTRAINT exportaciones_tipo_check;
      ALTER TABLE exportaciones ADD CONSTRAINT exportaciones_tipo_check
      CHECK(tipo IN ('MATRIZ_NOTAS','RESUMEN_PARTICIPANTES','ACTA_DEMOSTRACION'))`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM exportaciones WHERE tipo='ACTA_DEMOSTRACION') THEN
        RAISE EXCEPTION 'No se revierte el formato con exportaciones de acta persistidas' USING ERRCODE='23514';
      END IF;
      END $$;
      ALTER TABLE exportaciones DROP CONSTRAINT exportaciones_tipo_check;
      ALTER TABLE exportaciones ADD CONSTRAINT exportaciones_tipo_check
      CHECK(tipo IN ('MATRIZ_NOTAS','RESUMEN_PARTICIPANTES'))`);
  }
}
