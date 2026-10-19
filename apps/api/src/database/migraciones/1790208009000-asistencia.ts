import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B12: versiones para corrección concurrente y conservación del origen de cada marca. */
export class Asistencia1790208009000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE asistencias ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
      CREATE FUNCTION conservar_origen_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ROW(NEW.id,NEW.grupo_id,NEW.sesion_id,NEW.matricula_id,NEW.registrado_por,NEW.registrado_at)
          IS DISTINCT FROM ROW(OLD.id,OLD.grupo_id,OLD.sesion_id,OLD.matricula_id,OLD.registrado_por,OLD.registrado_at) THEN
          RAISE EXCEPTION 'Se conserva la sesión, intento y origen de la asistencia' USING ERRCODE='23001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER asistencias_origen_inmutable BEFORE UPDATE ON asistencias
        FOR EACH ROW EXECUTE FUNCTION conservar_origen_asistencia();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM asistencias) THEN
          RAISE EXCEPTION 'No se revierte B12 con historial de asistencia persistido' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER asistencias_origen_inmutable ON asistencias;
      DROP FUNCTION conservar_origen_asistencia();
      ALTER TABLE asistencias DROP COLUMN version;
    `);
  }
}
