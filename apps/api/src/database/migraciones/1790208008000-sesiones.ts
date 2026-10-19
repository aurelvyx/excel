import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B11: reutiliza sesiones_clase y conserva las fechas dentro del periodo en todas las vías. */
export class Sesiones1790208008000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM sesiones_clase s JOIN grupos g ON g.id=s.grupo_id
          JOIN periodos_academicos p ON p.id=g.periodo_id WHERE s.fecha<p.fecha_inicio OR s.fecha>p.fecha_fin) THEN
          RAISE EXCEPTION 'Hay sesiones fuera del periodo; revisar los datos antes de aplicar B11' USING ERRCODE='23514';
        END IF;
      END $$;

      CREATE FUNCTION validar_fecha_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE periodo bigint; inicio date; fin date;
      BEGIN
        SELECT periodo_id INTO periodo FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
        SELECT fecha_inicio,fecha_fin INTO inicio,fin FROM periodos_academicos WHERE id=periodo FOR SHARE;
        IF NEW.fecha<inicio OR NEW.fecha>fin THEN
          RAISE EXCEPTION 'La fecha de clase debe estar dentro del periodo académico' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER validar_fecha_sesion BEFORE INSERT OR UPDATE OF grupo_id,fecha ON sesiones_clase
        FOR EACH ROW EXECUTE FUNCTION validar_fecha_sesion();

      CREATE FUNCTION conservar_periodo_sesiones() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM sesiones_clase s JOIN grupos g ON g.id=s.grupo_id
          WHERE g.periodo_id=NEW.id AND (s.fecha<NEW.fecha_inicio OR s.fecha>NEW.fecha_fin)) THEN
          RAISE EXCEPTION 'El periodo no puede excluir sesiones ya registradas' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER conservar_periodo_sesiones BEFORE UPDATE OF fecha_inicio,fecha_fin ON periodos_academicos
        FOR EACH ROW EXECUTE FUNCTION conservar_periodo_sesiones();

      CREATE FUNCTION conservar_grupo_sesiones() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE inicio date; fin date;
      BEGIN
        SELECT fecha_inicio,fecha_fin INTO inicio,fin FROM periodos_academicos WHERE id=NEW.periodo_id FOR SHARE;
        IF EXISTS (SELECT 1 FROM sesiones_clase WHERE grupo_id=NEW.id AND (fecha<inicio OR fecha>fin)) THEN
          RAISE EXCEPTION 'El periodo del grupo no puede excluir sus sesiones' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER conservar_grupo_sesiones BEFORE UPDATE OF periodo_id ON grupos
        FOR EACH ROW EXECUTE FUNCTION conservar_grupo_sesiones();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DROP TRIGGER conservar_grupo_sesiones ON grupos;
      DROP FUNCTION conservar_grupo_sesiones();
      DROP TRIGGER conservar_periodo_sesiones ON periodos_academicos;
      DROP FUNCTION conservar_periodo_sesiones();
      DROP TRIGGER validar_fecha_sesion ON sesiones_clase;
      DROP FUNCTION validar_fecha_sesion();
    `);
  }
}
