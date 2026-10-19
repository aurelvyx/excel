import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B19 / RF53: evidencia de generación, sin guardar binarios ni datos personales. */
export class Exportaciones1790208015000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE exportaciones (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        tipo VARCHAR(30) NOT NULL CHECK(tipo IN ('MATRIZ_NOTAS','RESUMEN_PARTICIPANTES')),
        grupo_id BIGINT NOT NULL REFERENCES grupos(id) ON DELETE RESTRICT,
        filtros JSONB NOT NULL CHECK(jsonb_typeof(filtros)='object'),
        plantilla_id VARCHAR(80) NOT NULL CHECK(btrim(plantilla_id)<>''),
        plantilla_version INTEGER NOT NULL CHECK(plantilla_version>0),
        plantilla_sha256 CHAR(64) NOT NULL CHECK(plantilla_sha256 ~ '^[a-f0-9]{64}$'),
        revision CHAR(64) NOT NULL CHECK(revision ~ '^[a-f0-9]{64}$'),
        archivo_nombre VARCHAR(120) NOT NULL CHECK(archivo_nombre ~ '^[A-Za-z0-9._-]+[.]xlsx$'),
        archivo_sha256 CHAR(64) NOT NULL CHECK(archivo_sha256 ~ '^[a-f0-9]{64}$'),
        filas INTEGER NOT NULL CHECK(filas BETWEEN 1 AND 5000),
        modo VARCHAR(10) NOT NULL DEFAULT 'BORRADOR' CHECK(modo='BORRADOR'),
        generado_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX exportaciones_grupo_pagina ON exportaciones(grupo_id,id);
      CREATE INDEX exportaciones_usuario ON exportaciones(usuario_id);
      CREATE FUNCTION conservar_exportaciones() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'La evidencia de exportación es inmutable' USING ERRCODE='23001';
      END $$;
      CREATE TRIGGER exportaciones_inmutables BEFORE UPDATE OR DELETE ON exportaciones
        FOR EACH ROW EXECUTE FUNCTION conservar_exportaciones();
      CREATE TRIGGER exportaciones_sin_truncate BEFORE TRUNCATE ON exportaciones
        FOR EACH STATEMENT EXECUTE FUNCTION conservar_exportaciones();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM exportaciones)
          OR EXISTS(SELECT 1 FROM auditoria_eventos WHERE entidad='exportaciones' OR accion='EXPORT_XLSX') THEN
          RAISE EXCEPTION 'No se revierte B19 con evidencia de exportaciones persistida' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TABLE exportaciones;
      DROP FUNCTION conservar_exportaciones();
    `);
  }
}
