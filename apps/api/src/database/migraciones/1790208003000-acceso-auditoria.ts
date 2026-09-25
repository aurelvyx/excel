import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccesoAuditoria1790208003000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE sesiones_usuario (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        token_hash CHAR(64) NOT NULL UNIQUE,
        creado_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expira_at TIMESTAMPTZ NOT NULL,
        revocado_at TIMESTAMPTZ,
        CHECK (expira_at > creado_at)
      );
      CREATE INDEX ix_sesiones_usuario ON sesiones_usuario(usuario_id);
      CREATE INDEX ix_sesiones_expira ON sesiones_usuario(expira_at) WHERE revocado_at IS NULL;
      CREATE TABLE auditoria_eventos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario_id BIGINT REFERENCES usuarios(id) ON DELETE RESTRICT,
        accion VARCHAR(50) NOT NULL,
        entidad VARCHAR(80) NOT NULL,
        entidad_id VARCHAR(80) NOT NULL,
        valor_anterior JSONB,
        valor_nuevo JSONB,
        motivo VARCHAR(500),
        ip_origen INET,
        ocurrido_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX ix_auditoria_entidad ON auditoria_eventos(entidad, entidad_id, ocurrido_at DESC);
      CREATE INDEX ix_auditoria_usuario ON auditoria_eventos(usuario_id, ocurrido_at DESC);
      CREATE INDEX ix_auditoria_fecha ON auditoria_eventos(ocurrido_at DESC);
      CREATE FUNCTION proteger_auditoria() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'La auditoría es inmutable' USING ERRCODE = '23514';
      END $$;
      CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria_eventos
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_auditoria();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM sesiones_usuario) OR EXISTS (SELECT 1 FROM auditoria_eventos) THEN
          RAISE EXCEPTION 'No se revierte acceso con sesiones o auditoría existentes' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TABLE sesiones_usuario;
      DROP TABLE auditoria_eventos;
      DROP FUNCTION proteger_auditoria();
    `);
  }
}
