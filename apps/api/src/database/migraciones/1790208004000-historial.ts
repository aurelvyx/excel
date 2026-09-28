import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B06: soporte persistente de consulta; los comandos de negocio se implementan en B07–B15. */
export class Historial1790208004000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE vouchers (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        estudiante_id bigint NOT NULL REFERENCES estudiantes(id),
        numero varchar(60) NOT NULL CHECK (btrim(numero) <> ''),
        fecha_pago date NOT NULL, importe numeric(10,2) NOT NULL CHECK (importe > 0),
        estado varchar(15) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','VALIDADO','RECHAZADO')),
        observacion varchar(300), validado_por bigint REFERENCES usuarios(id), validado_at timestamptz,
        duplicado_autorizado_por bigint REFERENCES usuarios(id), duplicado_motivo varchar(300),
        CHECK ((duplicado_autorizado_por IS NULL AND duplicado_motivo IS NULL) OR (duplicado_autorizado_por IS NOT NULL AND duplicado_motivo IS NOT NULL AND length(btrim(duplicado_motivo)) > 0)),
        CHECK (estado = 'PENDIENTE' OR (validado_por IS NOT NULL AND validado_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX vouchers_numero_ordinario ON vouchers(numero) WHERE duplicado_autorizado_por IS NULL;
      CREATE INDEX vouchers_estudiante ON vouchers(estudiante_id);
      ALTER TABLE grupos ADD CONSTRAINT grupos_id_nivel UNIQUE(id,nivel_id);
      CREATE TABLE matriculas (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo varchar(40) NOT NULL UNIQUE CHECK (btrim(codigo) <> ''),
        estudiante_id bigint NOT NULL REFERENCES estudiantes(id), grupo_id bigint NOT NULL,
        nivel_id bigint NOT NULL REFERENCES niveles(id),
        FOREIGN KEY (grupo_id,nivel_id) REFERENCES grupos(id,nivel_id),
        voucher_id bigint UNIQUE REFERENCES vouchers(id), parametro_id bigint NOT NULL REFERENCES parametros_academicos(id),
        numero_intento smallint NOT NULL CHECK (numero_intento > 0), fecha_matricula date NOT NULL,
        estado varchar(15) NOT NULL CHECK (estado IN ('PENDIENTE','ACTIVA','ANULADA','CERRADA')),
        motivo_anulacion varchar(300), registrado_por bigint NOT NULL REFERENCES usuarios(id),
        UNIQUE(estudiante_id,nivel_id,numero_intento), UNIQUE(id,grupo_id),
        CHECK (estado <> 'ANULADA' OR (motivo_anulacion IS NOT NULL AND length(btrim(motivo_anulacion)) > 0)),
        CHECK (estado NOT IN ('ACTIVA','CERRADA') OR voucher_id IS NOT NULL)
      );
      CREATE UNIQUE INDEX matriculas_activas ON matriculas(estudiante_id,grupo_id) WHERE estado='ACTIVA';
      CREATE INDEX matriculas_grupo ON matriculas(grupo_id);
      CREATE TABLE sesiones_clase (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grupo_id bigint NOT NULL REFERENCES grupos(id),
        fecha date NOT NULL, hora_inicio time, hora_fin time,
        estado varchar(15) NOT NULL CHECK (estado IN ('PROGRAMADA','REALIZADA','CANCELADA')),
        creado_por bigint NOT NULL REFERENCES usuarios(id), UNIQUE(grupo_id,fecha), UNIQUE(id,grupo_id),
        CHECK ((hora_inicio IS NULL AND hora_fin IS NULL) OR (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_inicio<hora_fin))
      );
      CREATE TABLE asistencias (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grupo_id bigint NOT NULL REFERENCES grupos(id),
        sesion_id bigint NOT NULL, matricula_id bigint NOT NULL,
        FOREIGN KEY(sesion_id,grupo_id) REFERENCES sesiones_clase(id,grupo_id),
        FOREIGN KEY(matricula_id,grupo_id) REFERENCES matriculas(id,grupo_id),
        codigo char(1) NOT NULL CHECK (codigo IN ('P','F','T','J')), observacion varchar(250),
        registrado_por bigint NOT NULL REFERENCES usuarios(id), registrado_at timestamptz NOT NULL DEFAULT now(), actualizado_at timestamptz,
        UNIQUE(sesion_id,matricula_id)
      );
      CREATE INDEX asistencias_matricula ON asistencias(matricula_id);
      CREATE TABLE evaluaciones (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grupo_id bigint NOT NULL REFERENCES grupos(id),
        unidad_id bigint REFERENCES unidades_didacticas(id), nombre varchar(120) NOT NULL CHECK(btrim(nombre)<>''),
        peso_pct numeric(5,2) NOT NULL CHECK(peso_pct>0 AND peso_pct<=100), orden smallint NOT NULL CHECK(orden>0),
        activo boolean NOT NULL DEFAULT true, UNIQUE(grupo_id,nombre), UNIQUE(id,grupo_id)
      );
      CREATE TABLE indicadores_evaluacion (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, evaluacion_id bigint NOT NULL, grupo_id bigint NOT NULL REFERENCES grupos(id),
        FOREIGN KEY(evaluacion_id,grupo_id) REFERENCES evaluaciones(id,grupo_id),
        codigo varchar(20) NOT NULL CHECK(btrim(codigo)<>''), descripcion varchar(250) NOT NULL CHECK(btrim(descripcion)<>''),
        peso_pct numeric(5,2) NOT NULL CHECK(peso_pct>0 AND peso_pct<=100), orden smallint NOT NULL CHECK(orden>0),
        activo boolean NOT NULL DEFAULT true, UNIQUE(evaluacion_id,codigo), UNIQUE(id,grupo_id)
      );
      CREATE TABLE calificaciones (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, matricula_id bigint NOT NULL, indicador_id bigint NOT NULL, grupo_id bigint NOT NULL REFERENCES grupos(id),
        FOREIGN KEY(matricula_id,grupo_id) REFERENCES matriculas(id,grupo_id),
        FOREIGN KEY(indicador_id,grupo_id) REFERENCES indicadores_evaluacion(id,grupo_id),
        nota numeric(4,2) NOT NULL CHECK(nota>=0 AND nota<=20), registrado_por bigint NOT NULL REFERENCES usuarios(id),
        registrado_at timestamptz NOT NULL DEFAULT now(), actualizado_at timestamptz, UNIQUE(matricula_id,indicador_id)
      );
      CREATE TABLE resultados_academicos (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, matricula_id bigint NOT NULL UNIQUE REFERENCES matriculas(id),
        promedio numeric(5,2) CHECK(promedio>=0 AND promedio<=20), nota_oficial smallint CHECK(nota_oficial>=0 AND nota_oficial<=20),
        tardanzas_total smallint NOT NULL CHECK(tardanzas_total>=0), faltas_equivalentes numeric(6,2) NOT NULL CHECK(faltas_equivalentes>=0),
        inasistencia_pct numeric(5,2) CHECK(inasistencia_pct>=0 AND inasistencia_pct<=100),
        condicion varchar(30) CHECK(condicion IN ('APROBADO','DESAPROBADO','RETIRADO_INASISTENCIA')),
        calculado_at timestamptz NOT NULL DEFAULT now(), confirmado_at timestamptz,
        CHECK(confirmado_at IS NULL OR condicion IS NOT NULL)
      );
      CREATE FUNCTION proteger_historial() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'El historial no se elimina físicamente' USING ERRCODE='23001'; END $$;
      CREATE FUNCTION validar_voucher_matricula() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.voucher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vouchers WHERE id=NEW.voucher_id AND estudiante_id=NEW.estudiante_id AND (NEW.estado NOT IN ('ACTIVA','CERRADA') OR estado='VALIDADO') FOR SHARE) THEN
          RAISE EXCEPTION 'Voucher inválido para la matrícula' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' AND ROW(OLD.estudiante_id,OLD.grupo_id,OLD.nivel_id,OLD.numero_intento,OLD.parametro_id) IS DISTINCT FROM ROW(NEW.estudiante_id,NEW.grupo_id,NEW.nivel_id,NEW.numero_intento,NEW.parametro_id) THEN
          RAISE EXCEPTION 'La identidad del intento se conserva' USING ERRCODE='23001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER validar_voucher_matricula BEFORE INSERT OR UPDATE ON matriculas FOR EACH ROW EXECUTE FUNCTION validar_voucher_matricula();
    `);
    for (const table of [
      'vouchers',
      'matriculas',
      'sesiones_clase',
      'asistencias',
      'evaluaciones',
      'indicadores_evaluacion',
      'calificaciones',
      'resultados_academicos',
    ])
      await r.query(
        `CREATE TRIGGER conservar_historial BEFORE DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION proteger_historial()`,
      );
  }
  async down(r: QueryRunner): Promise<void> {
    const tables = [
      'resultados_academicos',
      'calificaciones',
      'indicadores_evaluacion',
      'evaluaciones',
      'asistencias',
      'sesiones_clase',
      'matriculas',
      'vouchers',
    ];
    for (const table of tables) {
      const [row] = await r.query(
        `SELECT EXISTS(SELECT 1 FROM ${table}) AS occupied`,
      );
      if (row.occupied)
        throw new Error('No se revierte B06 con historial persistido');
    }
    for (const table of tables) await r.query(`DROP TABLE ${table}`);
    await r.query(
      'DROP FUNCTION validar_voucher_matricula(); DROP FUNCTION proteger_historial(); ALTER TABLE grupos DROP CONSTRAINT grupos_id_nivel',
    );
  }
}
