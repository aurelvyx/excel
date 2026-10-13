import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B14: expedientes versionados y conservación de su marca J, decisiones y responsables. */
export class Justificaciones1790208010000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE asistencias ADD CONSTRAINT asistencias_id_codigo UNIQUE(id,codigo);
      CREATE TABLE justificaciones (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        asistencia_id bigint NOT NULL UNIQUE,
        codigo_asistencia char(1) NOT NULL DEFAULT 'J' CHECK(codigo_asistencia='J'),
        FOREIGN KEY(asistencia_id,codigo_asistencia) REFERENCES asistencias(id,codigo)
          ON UPDATE RESTRICT ON DELETE RESTRICT,
        motivo varchar(500) NOT NULL CHECK(length(btrim(motivo))>0),
        fecha_presentacion date NOT NULL,
        estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
          CHECK(estado IN ('PENDIENTE','APROBADA','RECHAZADA','RECUPERADA','NO_RECUPERADA')),
        registrado_por bigint NOT NULL REFERENCES usuarios(id),
        registrado_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version integer NOT NULL DEFAULT 1 CHECK(version>0),
        observacion_resolucion varchar(300)
          CHECK(observacion_resolucion IS NULL OR length(btrim(observacion_resolucion))>0),
        resuelto_por bigint REFERENCES usuarios(id),
        resuelto_at timestamptz,
        observacion_recuperacion varchar(300)
          CHECK(observacion_recuperacion IS NULL OR length(btrim(observacion_recuperacion))>0),
        recuperacion_confirmada_por bigint REFERENCES usuarios(id),
        recuperacion_at timestamptz,
        CHECK(fecha_presentacion<=(registrado_at AT TIME ZONE 'America/Lima')::date),
        CHECK(resuelto_at IS NULL OR resuelto_at>=registrado_at),
        CHECK(recuperacion_at IS NULL OR recuperacion_at>=resuelto_at),
        CHECK(
          (estado='PENDIENTE' AND resuelto_por IS NULL AND resuelto_at IS NULL AND observacion_resolucion IS NULL)
          OR (estado IN ('APROBADA','RECHAZADA','RECUPERADA','NO_RECUPERADA')
            AND resuelto_por IS NOT NULL AND resuelto_at IS NOT NULL AND observacion_resolucion IS NOT NULL)
        ),
        CHECK(
          (estado IN ('RECUPERADA','NO_RECUPERADA') AND recuperacion_confirmada_por IS NOT NULL AND recuperacion_at IS NOT NULL)
          OR (estado IN ('PENDIENTE','APROBADA','RECHAZADA') AND recuperacion_confirmada_por IS NULL
            AND recuperacion_at IS NULL AND observacion_recuperacion IS NULL)
        )
      );

      CREATE FUNCTION validar_expediente_justificacion() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE marca char(1); fecha_clase date;
      BEGIN
        IF TG_OP='INSERT' THEN
          IF NEW.estado<>'PENDIENTE' OR NEW.version<>1 THEN
            RAISE EXCEPTION 'Una justificación inicia pendiente con versión 1' USING ERRCODE='23514';
          END IF;
        ELSE
          IF ROW(NEW.id,NEW.asistencia_id,NEW.codigo_asistencia,NEW.motivo,NEW.fecha_presentacion,NEW.registrado_por,NEW.registrado_at)
            IS DISTINCT FROM ROW(OLD.id,OLD.asistencia_id,OLD.codigo_asistencia,OLD.motivo,OLD.fecha_presentacion,OLD.registrado_por,OLD.registrado_at) THEN
            RAISE EXCEPTION 'Se conserva la solicitud y el origen de la justificación' USING ERRCODE='23001';
          END IF;
          IF NEW.version<>OLD.version+1 THEN
            RAISE EXCEPTION 'La versión de la justificación debe avanzar exactamente una unidad' USING ERRCODE='23514';
          END IF;
          IF NOT (
            (OLD.estado='PENDIENTE' AND NEW.estado IN ('APROBADA','RECHAZADA'))
            OR (OLD.estado='APROBADA' AND NEW.estado IN ('RECUPERADA','NO_RECUPERADA'))
          ) THEN
            RAISE EXCEPTION 'La transición de la justificación no está permitida' USING ERRCODE='23514';
          END IF;
          IF OLD.estado='APROBADA' AND ROW(NEW.resuelto_por,NEW.resuelto_at,NEW.observacion_resolucion)
            IS DISTINCT FROM ROW(OLD.resuelto_por,OLD.resuelto_at,OLD.observacion_resolucion) THEN
            RAISE EXCEPTION 'La recuperación conserva la aprobación original' USING ERRCODE='23001';
          END IF;
        END IF;

        SELECT a.codigo,s.fecha INTO marca,fecha_clase FROM asistencias a
          JOIN sesiones_clase s ON s.id=a.sesion_id
          WHERE a.id=NEW.asistencia_id FOR SHARE OF a,s;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'La asistencia de la justificación no existe' USING ERRCODE='23503';
        END IF;
        IF marca<>'J' THEN
          RAISE EXCEPTION 'La justificación requiere una asistencia con marca J' USING ERRCODE='23514';
        END IF;
        IF NEW.fecha_presentacion<fecha_clase
          OR NEW.fecha_presentacion>(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date THEN
          RAISE EXCEPTION 'La fecha de presentación debe estar entre la fecha de clase y hoy' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER justificaciones_flujo BEFORE INSERT OR UPDATE ON justificaciones
        FOR EACH ROW EXECUTE FUNCTION validar_expediente_justificacion();
      CREATE TRIGGER conservar_historial BEFORE DELETE ON justificaciones
        FOR EACH ROW EXECUTE FUNCTION proteger_historial();

      CREATE FUNCTION conservar_marca_justificada() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.codigo<>'J' AND EXISTS(SELECT 1 FROM justificaciones WHERE asistencia_id=OLD.id) THEN
          RAISE EXCEPTION 'La marca J conserva su expediente de justificación' USING ERRCODE='23001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER asistencias_expediente_justificacion BEFORE UPDATE OF codigo ON asistencias
        FOR EACH ROW EXECUTE FUNCTION conservar_marca_justificada();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM justificaciones) THEN
          RAISE EXCEPTION 'No se revierte B14 con historial de justificaciones persistido' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER asistencias_expediente_justificacion ON asistencias;
      DROP FUNCTION conservar_marca_justificada();
      DROP TABLE justificaciones;
      DROP FUNCTION validar_expediente_justificacion();
      ALTER TABLE asistencias DROP CONSTRAINT asistencias_id_codigo;
    `);
  }
}
