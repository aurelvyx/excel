import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B15: cierre persistido e inmutable y bloqueo de escrituras del registro cerrado. */
export class CierresAsistencia1790208011000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE cierres_academicos (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        grupo_id bigint NOT NULL REFERENCES grupos(id),
        tipo varchar(15) NOT NULL CHECK(tipo IN ('ASISTENCIA','ACTA')),
        estado varchar(15) NOT NULL CHECK(estado IN ('CERRADO','REABIERTO')),
        motivo varchar(400) CHECK(motivo IS NULL OR length(btrim(motivo))>0),
        realizado_por bigint NOT NULL REFERENCES usuarios(id),
        realizado_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revision char(64) NOT NULL CHECK(revision::text ~ '^[0-9a-f]{64}$'),
        resumen jsonb NOT NULL CHECK(jsonb_typeof(resumen)='object')
      );
      CREATE UNIQUE INDEX cierres_asistencia_unico ON cierres_academicos(grupo_id)
        WHERE tipo='ASISTENCIA' AND estado='CERRADO';
      CREATE INDEX cierres_academicos_grupo_tipo ON cierres_academicos(grupo_id,tipo,id DESC);

      CREATE FUNCTION registrar_cierre_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo<>'ASISTENCIA' OR NEW.estado<>'CERRADO' THEN
          RAISE EXCEPTION 'B15 únicamente registra el cierre de asistencia; actas y reapertura no están disponibles' USING ERRCODE='23514';
        END IF;
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        -- Una nueva versión MVCC impide que un snapshot anterior ignore el cierre tras esperar.
        UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        RETURN NEW;
      END $$;
      CREATE TRIGGER cierres_asistencia_registro BEFORE INSERT ON cierres_academicos
        FOR EACH ROW EXECUTE FUNCTION registrar_cierre_asistencia();
      CREATE TRIGGER cierres_academicos_inmutables BEFORE UPDATE OR DELETE OR TRUNCATE ON cierres_academicos
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_historial();

      CREATE FUNCTION bloquear_sesiones_cerradas() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='UPDATE' THEN
          PERFORM id FROM grupos WHERE id IN (OLD.grupo_id,NEW.grupo_id) ORDER BY id FOR SHARE;
          IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id IN (OLD.grupo_id,NEW.grupo_id)
            AND tipo='ASISTENCIA' AND estado='CERRADO') THEN
            RAISE EXCEPTION 'La asistencia del grupo está cerrada; sus sesiones se conservan' USING ERRCODE='23514';
          END IF;
        ELSE
          PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
          IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=NEW.grupo_id
            AND tipo='ASISTENCIA' AND estado='CERRADO') THEN
            RAISE EXCEPTION 'La asistencia del grupo está cerrada; no se programan más sesiones' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER sesiones_asistencia_cerrada BEFORE INSERT OR UPDATE ON sesiones_clase
        FOR EACH ROW EXECUTE FUNCTION bloquear_sesiones_cerradas();

      CREATE FUNCTION bloquear_matriculas_cerradas() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.estado IN ('ACTIVA','PENDIENTE') THEN
          PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
          IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=NEW.grupo_id
            AND tipo='ASISTENCIA' AND estado='CERRADO') THEN
            RAISE EXCEPTION 'La asistencia del grupo está cerrada; no se registran ni activan matrículas' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER matriculas_asistencia_cerrada BEFORE INSERT OR UPDATE ON matriculas
        FOR EACH ROW EXECUTE FUNCTION bloquear_matriculas_cerradas();

      CREATE FUNCTION proteger_asistencias_cerradas() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cierre_id bigint;
      BEGIN
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
        SELECT id INTO cierre_id FROM cierres_academicos WHERE grupo_id=NEW.grupo_id
          AND tipo='ASISTENCIA' AND estado='CERRADO' ORDER BY id DESC LIMIT 1;
        IF cierre_id IS NOT NULL AND COALESCE(current_setting('excel.attendance_correction',true),'')<>cierre_id::text THEN
          RAISE EXCEPTION 'La asistencia está cerrada; la corrección requiere el contexto administrativo del cierre' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER asistencias_cierre_administrativo BEFORE INSERT OR UPDATE ON asistencias
        FOR EACH ROW EXECUTE FUNCTION proteger_asistencias_cerradas();

      CREATE FUNCTION bloquear_justificaciones_cerradas() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE grupo bigint;
      BEGIN
        SELECT grupo_id INTO grupo FROM asistencias WHERE id=NEW.asistencia_id;
        PERFORM id FROM grupos WHERE id=grupo FOR SHARE;
        IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=grupo
          AND tipo='ASISTENCIA' AND estado='CERRADO') THEN
          RAISE EXCEPTION 'La asistencia del grupo está cerrada; el expediente se conserva en consulta' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER justificaciones_asistencia_cerrada BEFORE INSERT OR UPDATE ON justificaciones
        FOR EACH ROW EXECUTE FUNCTION bloquear_justificaciones_cerradas();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM cierres_academicos) THEN
          RAISE EXCEPTION 'No se revierte B15 con historial de cierres persistido' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER justificaciones_asistencia_cerrada ON justificaciones;
      DROP FUNCTION bloquear_justificaciones_cerradas();
      DROP TRIGGER asistencias_cierre_administrativo ON asistencias;
      DROP FUNCTION proteger_asistencias_cerradas();
      DROP TRIGGER matriculas_asistencia_cerrada ON matriculas;
      DROP FUNCTION bloquear_matriculas_cerradas();
      DROP TRIGGER sesiones_asistencia_cerrada ON sesiones_clase;
      DROP FUNCTION bloquear_sesiones_cerradas();
      DROP TABLE cierres_academicos;
      DROP FUNCTION registrar_cierre_asistencia();
    `);
  }
}
