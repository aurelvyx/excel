import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B21/RF56: cada inicio y resultado es un evento inmutable de operación. */
export class Respaldos1790208016000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE respaldos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        operacion_id UUID NOT NULL,
        tipo VARCHAR(15) NOT NULL CHECK(tipo IN ('RESPALDO','RESTAURACION')),
        estado VARCHAR(15) NOT NULL CHECK(estado IN ('INICIADO','EXITOSO','FALLIDO')),
        ubicacion_logica VARCHAR(300) NOT NULL CHECK(ubicacion_logica ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
        checksum CHAR(64) CHECK(checksum ~ '^[a-f0-9]{64}$'),
        manifest_sha256 CHAR(64) CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
        tamano_bytes BIGINT CHECK(tamano_bytes>0),
        detalle VARCHAR(500) NOT NULL CHECK(btrim(detalle)<>''),
        ejecutado_por BIGINT REFERENCES usuarios(id) ON DELETE RESTRICT,
        proceso_tecnico VARCHAR(80) CHECK(proceso_tecnico ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
        iniciado_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finalizado_at TIMESTAMPTZ,
        respaldo_id BIGINT REFERENCES respaldos(id) ON DELETE RESTRICT,
        verificacion_completa BOOLEAN NOT NULL DEFAULT FALSE,
        CHECK((ejecutado_por IS NULL) <> (proceso_tecnico IS NULL)),
        CHECK((tipo='RESPALDO' AND respaldo_id IS NULL) OR (tipo='RESTAURACION' AND respaldo_id IS NOT NULL)),
        CHECK((estado='INICIADO' AND finalizado_at IS NULL AND checksum IS NULL AND manifest_sha256 IS NULL AND tamano_bytes IS NULL)
          OR (estado<>'INICIADO' AND finalizado_at IS NOT NULL AND finalizado_at>=iniciado_at)),
        CHECK(estado<>'EXITOSO' OR (checksum IS NOT NULL AND manifest_sha256 IS NOT NULL AND tamano_bytes IS NOT NULL)),
        CHECK(NOT verificacion_completa OR (tipo='RESTAURACION' AND estado='EXITOSO'))
      );
      CREATE UNIQUE INDEX respaldos_un_inicio ON respaldos(operacion_id) WHERE estado='INICIADO';
      CREATE UNIQUE INDEX respaldos_un_resultado ON respaldos(operacion_id) WHERE estado<>'INICIADO';
      CREATE INDEX respaldos_operacion_evento ON respaldos(operacion_id,id DESC);
      CREATE INDEX respaldos_tipo_fecha ON respaldos(tipo,id DESC);
      CREATE INDEX respaldos_origen ON respaldos(respaldo_id);
      CREATE FUNCTION validar_evento_respaldo() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE inicio respaldos; origen respaldos;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.operacion_id::text, 21));
        IF NEW.estado='INICIADO' THEN
          IF EXISTS(SELECT 1 FROM respaldos WHERE operacion_id=NEW.operacion_id) THEN
            RAISE EXCEPTION 'La operación ya existe' USING ERRCODE='23514';
          END IF;
        ELSE
          SELECT * INTO inicio FROM respaldos WHERE operacion_id=NEW.operacion_id AND estado='INICIADO';
          IF inicio.id IS NULL OR NEW.tipo<>inicio.tipo OR NEW.ubicacion_logica<>inicio.ubicacion_logica
            OR NEW.ejecutado_por IS DISTINCT FROM inicio.ejecutado_por
            OR NEW.proceso_tecnico IS DISTINCT FROM inicio.proceso_tecnico
            OR NEW.iniciado_at<>inicio.iniciado_at OR NEW.respaldo_id IS DISTINCT FROM inicio.respaldo_id THEN
            RAISE EXCEPTION 'El resultado requiere su inicio y el mismo contexto' USING ERRCODE='23514';
          END IF;
        END IF;
        IF NEW.tipo='RESTAURACION' THEN
          SELECT * INTO origen FROM respaldos WHERE id=NEW.respaldo_id AND tipo='RESPALDO' AND estado='EXITOSO';
          IF origen.id IS NULL OR NEW.ubicacion_logica<>origen.ubicacion_logica
            OR (NEW.estado='EXITOSO' AND (NEW.checksum<>origen.checksum OR NEW.manifest_sha256<>origen.manifest_sha256 OR NEW.tamano_bytes<>origen.tamano_bytes)) THEN
            RAISE EXCEPTION 'La verificación requiere un respaldo exitoso e idéntico' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER respaldos_contexto BEFORE INSERT ON respaldos FOR EACH ROW EXECUTE FUNCTION validar_evento_respaldo();
      CREATE FUNCTION conservar_respaldos() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'La evidencia de respaldo es inmutable' USING ERRCODE='23001';
      END $$;
      CREATE TRIGGER respaldos_inmutables BEFORE UPDATE OR DELETE ON respaldos FOR EACH ROW EXECUTE FUNCTION conservar_respaldos();
      CREATE TRIGGER respaldos_sin_truncate BEFORE TRUNCATE ON respaldos FOR EACH STATEMENT EXECUTE FUNCTION conservar_respaldos();
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM respaldos) OR EXISTS(SELECT 1 FROM auditoria_eventos WHERE entidad='respaldos') THEN
          RAISE EXCEPTION 'No se revierte B21 con evidencia de respaldos' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TABLE respaldos;
      DROP FUNCTION validar_evento_respaldo();
      DROP FUNCTION conservar_respaldos();
    `);
  }
}
