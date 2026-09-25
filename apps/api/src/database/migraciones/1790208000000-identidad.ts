import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Identidad1790208000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE personas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tipo_documento VARCHAR(20) NOT NULL CHECK (btrim(tipo_documento) <> ''),
        numero_documento VARCHAR(25) NOT NULL CHECK (btrim(numero_documento) <> ''),
        nombres VARCHAR(100) NOT NULL CHECK (btrim(nombres) <> ''),
        apellido_paterno VARCHAR(80) NOT NULL CHECK (btrim(apellido_paterno) <> ''),
        apellido_materno VARCHAR(80), fecha_nacimiento DATE, sexo VARCHAR(20),
        telefono VARCHAR(25), correo VARCHAR(150), direccion VARCHAR(250),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT uq_personas_documento UNIQUE (tipo_documento, numero_documento)
      );
      CREATE TABLE estudiantes (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        persona_id BIGINT NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
        codigo_estudiante VARCHAR(30) NOT NULL UNIQUE CHECK (btrim(codigo_estudiante) <> ''),
        fecha_registro DATE NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE docentes (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        persona_id BIGINT NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
        codigo_docente VARCHAR(30) NOT NULL UNIQUE CHECK (btrim(codigo_docente) <> ''),
        especialidad VARCHAR(120), activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE usuarios (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        persona_id BIGINT UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
        nombre_usuario VARCHAR(60) NOT NULL UNIQUE CHECK (btrim(nombre_usuario) <> ''),
        password_hash VARCHAR(255) NOT NULL CHECK (btrim(password_hash) <> ''),
        requiere_cambio_clave BOOLEAN NOT NULL DEFAULT TRUE,
        ultimo_acceso_at TIMESTAMPTZ, activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE roles (
        id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo VARCHAR(30) NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
        nombre VARCHAR(80) NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
        descripcion VARCHAR(250), activo BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE usuario_roles (
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        rol_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        asignado_por BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        asignado_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, rol_id)
      );
      CREATE INDEX ix_usuario_roles_rol ON usuario_roles(rol_id);
      CREATE INDEX ix_usuario_roles_asignado_por ON usuario_roles(asignado_por);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM personas) OR EXISTS (SELECT 1 FROM estudiantes)
          OR EXISTS (SELECT 1 FROM docentes) OR EXISTS (SELECT 1 FROM usuarios)
          OR EXISTS (SELECT 1 FROM roles) OR EXISTS (SELECT 1 FROM usuario_roles) THEN
          RAISE EXCEPTION 'No se revierte identidad con datos existentes' USING ERRCODE = '23514';
        END IF;
      END $$;
      DROP TABLE usuario_roles;
      DROP TABLE roles;
      DROP TABLE usuarios;
      DROP TABLE docentes;
      DROP TABLE estudiantes;
      DROP TABLE personas;
    `);
  }
}
