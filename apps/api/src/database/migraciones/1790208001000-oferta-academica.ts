import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OfertaAcademica1790208001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idiomas (
        id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo VARCHAR(15) NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(80) NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
        activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE niveles (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        idioma_id SMALLINT NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
        prerrequisito_id BIGINT,
        codigo VARCHAR(20) NOT NULL CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
        orden SMALLINT NOT NULL CHECK (orden > 0),
        duracion_meses SMALLINT CHECK (duracion_meses > 0),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (idioma_id, codigo), UNIQUE (idioma_id, orden), UNIQUE (id, idioma_id),
        CONSTRAINT ck_nivel_prerrequisito_distinto CHECK (prerrequisito_id <> id),
        CONSTRAINT fk_nivel_prerrequisito_idioma FOREIGN KEY (prerrequisito_id, idioma_id)
          REFERENCES niveles(id, idioma_id) ON DELETE RESTRICT
      );
      CREATE INDEX ix_niveles_prerrequisito ON niveles(prerrequisito_id, idioma_id);
      CREATE FUNCTION validar_orden_prerrequisito() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        -- Serializa cambios del catálogo de niveles para evitar ciclos concurrentes.
        PERFORM pg_advisory_xact_lock(20260924, 2);
        IF EXISTS (SELECT 1 FROM niveles WHERE id = NEW.prerrequisito_id AND orden >= NEW.orden)
          OR EXISTS (SELECT 1 FROM niveles WHERE prerrequisito_id = NEW.id AND orden <= NEW.orden) THEN
          RAISE EXCEPTION 'El prerrequisito debe ser un nivel de orden anterior' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_niveles_orden BEFORE INSERT OR UPDATE ON niveles
        FOR EACH ROW EXECUTE FUNCTION validar_orden_prerrequisito();
      CREATE TABLE unidades_didacticas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nivel_id BIGINT NOT NULL REFERENCES niveles(id) ON DELETE RESTRICT,
        codigo VARCHAR(20) NOT NULL CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(120) NOT NULL CHECK (btrim(nombre) <> ''),
        creditos NUMERIC(4,1) CHECK (creditos >= 0),
        horas_teoricas SMALLINT NOT NULL CHECK (horas_teoricas >= 0),
        horas_practicas SMALLINT NOT NULL CHECK (horas_practicas >= 0),
        orden SMALLINT NOT NULL CHECK (orden > 0),
        activo BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE (nivel_id, codigo)
      );
      CREATE TABLE periodos_academicos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo VARCHAR(20) NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(100) NOT NULL CHECK (btrim(nombre) <> ''),
        fecha_inicio DATE NOT NULL, fecha_fin DATE NOT NULL,
        matricula_inicio DATE NOT NULL, matricula_fin DATE NOT NULL,
        estado VARCHAR(15) NOT NULL CHECK (estado IN ('PLANIFICADO','ABIERTO','CERRADO')),
        CHECK (fecha_inicio <= fecha_fin), CHECK (matricula_inicio <= matricula_fin)
      );
      CREATE TABLE turnos (
        id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
        hora_inicio TIME, hora_fin TIME, activo BOOLEAN NOT NULL DEFAULT TRUE,
        CHECK ((hora_inicio IS NULL AND hora_fin IS NULL) OR
          (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_inicio < hora_fin))
      );
      CREATE TABLE secciones (
        id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo VARCHAR(15) NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(60) NOT NULL CHECK (btrim(nombre) <> ''), activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE grupos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        periodo_id BIGINT NOT NULL REFERENCES periodos_academicos(id) ON DELETE RESTRICT,
        nivel_id BIGINT NOT NULL REFERENCES niveles(id) ON DELETE RESTRICT,
        turno_id SMALLINT NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
        seccion_id SMALLINT NOT NULL REFERENCES secciones(id) ON DELETE RESTRICT,
        codigo VARCHAR(30) NOT NULL CHECK (btrim(codigo) <> ''),
        capacidad SMALLINT CHECK (capacidad > 0),
        estado VARCHAR(15) NOT NULL CHECK (estado IN ('PLANIFICADO','ACTIVO','CERRADO')),
        UNIQUE (periodo_id, codigo)
      );
      CREATE INDEX ix_grupos_nivel ON grupos(nivel_id);
      CREATE INDEX ix_grupos_turno ON grupos(turno_id);
      CREATE INDEX ix_grupos_seccion ON grupos(seccion_id);
      CREATE TABLE grupo_docentes (
        grupo_id BIGINT NOT NULL REFERENCES grupos(id) ON DELETE RESTRICT,
        docente_id BIGINT NOT NULL REFERENCES docentes(id) ON DELETE RESTRICT,
        es_titular BOOLEAN NOT NULL DEFAULT FALSE, fecha_asignacion DATE NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY (grupo_id, docente_id)
      );
      CREATE INDEX ix_grupo_docentes_docente ON grupo_docentes(docente_id);
      CREATE FUNCTION validar_docente_asignado() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE docente_activo BOOLEAN;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          IF NEW.docente_id = OLD.docente_id AND NEW.grupo_id = OLD.grupo_id AND
            (NOT NEW.activo OR OLD.activo) THEN RETURN NEW; END IF;
        END IF;
        SELECT activo INTO docente_activo FROM docentes WHERE id = NEW.docente_id FOR SHARE;
        IF docente_activo IS FALSE THEN
          RAISE EXCEPTION 'No se puede asignar un docente inactivo' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_grupo_docente_activo BEFORE INSERT OR UPDATE ON grupo_docentes
        FOR EACH ROW EXECUTE FUNCTION validar_docente_asignado();
      CREATE TABLE parametros_academicos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE CHECK (version > 0),
        nota_minima NUMERIC(4,2) NOT NULL CHECK (nota_minima BETWEEN 0 AND 20),
        inasistencia_max_pct NUMERIC(5,2) NOT NULL CHECK (inasistencia_max_pct BETWEEN 0 AND 100),
        tardanzas_por_falta SMALLINT NOT NULL CHECK (tardanzas_por_falta > 0),
        vigente_desde TIMESTAMPTZ NOT NULL, vigente_hasta TIMESTAMPTZ,
        creado_por BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
      );
      CREATE INDEX ix_parametros_creado_por ON parametros_academicos(creado_por);
      CREATE FUNCTION proteger_version_academica() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Las versiones académicas son inmutables; cree otra versión' USING ERRCODE = '23514';
      END $$;
      CREATE TRIGGER trg_parametros_inmutables BEFORE UPDATE OR DELETE ON parametros_academicos
        FOR EACH ROW EXECUTE FUNCTION proteger_version_academica();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM idiomas) OR EXISTS (SELECT 1 FROM niveles)
          OR EXISTS (SELECT 1 FROM unidades_didacticas) OR EXISTS (SELECT 1 FROM periodos_academicos)
          OR EXISTS (SELECT 1 FROM turnos) OR EXISTS (SELECT 1 FROM secciones)
          OR EXISTS (SELECT 1 FROM grupos) OR EXISTS (SELECT 1 FROM grupo_docentes)
          OR EXISTS (SELECT 1 FROM parametros_academicos) THEN
          RAISE EXCEPTION 'No se revierte oferta académica con datos existentes' USING ERRCODE = '23514';
        END IF;
      END $$;
      DROP TABLE parametros_academicos;
      DROP FUNCTION proteger_version_academica();
      DROP TABLE grupo_docentes;
      DROP FUNCTION validar_docente_asignado();
      DROP TABLE grupos;
      DROP TABLE secciones;
      DROP TABLE turnos;
      DROP TABLE periodos_academicos;
      DROP TABLE unidades_didacticas;
      DROP TABLE niveles;
      DROP FUNCTION validar_orden_prerrequisito();
      DROP TABLE idiomas;
    `);
  }
}
