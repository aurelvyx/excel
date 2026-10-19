import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B17: notas abiertas versionadas, sin alteración del origen ni del historial. */
export class CalificacionesAbiertas1790208013000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE calificaciones ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
      -- La escala se valida antes de que un typmod pueda redondear una entrada inválida.
      ALTER TABLE calificaciones ALTER COLUMN nota TYPE numeric USING nota::numeric;
      ALTER TABLE calificaciones ADD CONSTRAINT calificaciones_precision_decimal
        CHECK(nota BETWEEN 0 AND 20 AND scale(nota)<=2);
      ALTER TABLE calificaciones ADD CONSTRAINT calificaciones_fechas_consistentes
        CHECK(actualizado_at IS NULL OR actualizado_at>=registrado_at);
      CREATE INDEX calificaciones_grupo ON calificaciones(grupo_id);

      CREATE FUNCTION validar_calificacion_abierta() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE estado_grupo text; estado_periodo text; estado_matricula text;
      BEGIN
        IF NEW.nota IS NULL OR NEW.nota<0 OR NEW.nota>20 OR scale(NEW.nota)>2 THEN
          RAISE EXCEPTION 'La nota debe estar entre 0 y 20 con hasta dos decimales y no puede quedar vacía' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' THEN
          IF ROW(NEW.id,NEW.matricula_id,NEW.indicador_id,NEW.grupo_id,NEW.registrado_por,NEW.registrado_at)
            IS DISTINCT FROM ROW(OLD.id,OLD.matricula_id,OLD.indicador_id,OLD.grupo_id,OLD.registrado_por,OLD.registrado_at) THEN
            RAISE EXCEPTION 'La identidad del intento, criterio y origen de la nota se conserva' USING ERRCODE='23001';
          END IF;
          IF NEW.version<>OLD.version+1 THEN
            RAISE EXCEPTION 'La actualización exige la versión siguiente de la calificación' USING ERRCODE='23514';
          END IF;
        ELSIF NEW.version<>1 OR NEW.actualizado_at IS NOT NULL THEN
          RAISE EXCEPTION 'Una nota nueva comienza en versión 1 sin fecha de corrección' USING ERRCODE='23514';
        END IF;

        -- Cierre, resultado y registro comparten el mismo bloqueo de grupo.
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        SELECT g.estado,p.estado INTO estado_grupo,estado_periodo FROM grupos g
          JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=NEW.grupo_id FOR SHARE OF p;
        IF estado_grupo IS DISTINCT FROM 'ACTIVO' OR estado_periodo IS DISTINCT FROM 'ABIERTO' THEN
          RAISE EXCEPTION 'El grupo y su periodo deben estar abiertos para registrar notas' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=NEW.grupo_id AND tipo='ACTA' AND estado='CERRADO') THEN
          RAISE EXCEPTION 'El acta está cerrada; B17 no permite correcciones posteriores' USING ERRCODE='23514';
        END IF;
        SELECT estado INTO estado_matricula FROM matriculas
          WHERE id=NEW.matricula_id AND grupo_id=NEW.grupo_id FOR SHARE;
        IF estado_matricula IS DISTINCT FROM 'ACTIVA' THEN
          RAISE EXCEPTION 'Solo una matrícula activa del grupo recibe notas abiertas' USING ERRCODE='23514';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM indicadores_evaluacion i
          JOIN evaluaciones e ON e.id=i.evaluacion_id AND e.grupo_id=i.grupo_id
          JOIN configuraciones_evaluacion_grupo c ON c.id=e.configuracion_id AND c.grupo_id=e.grupo_id
          JOIN planes_evaluacion p ON p.id=c.plan_id AND p.nivel_id=c.nivel_id
          WHERE i.id=NEW.indicador_id AND i.grupo_id=NEW.grupo_id AND i.activo AND e.activo AND p.estado='APROBADO'
          FOR SHARE OF i,e,c,p) THEN
          RAISE EXCEPTION 'La nota requiere un criterio activo de la configuración aprobada aplicada al grupo' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM resultados_academicos WHERE matricula_id=NEW.matricula_id FOR SHARE) THEN
          RAISE EXCEPTION 'El intento conserva un resultado académico; su corrección requiere el flujo administrativo posterior' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' THEN
          NEW.actualizado_at:=GREATEST(clock_timestamp(),OLD.registrado_at,OLD.actualizado_at);
        END IF;
        -- Fuerza una versión MVCC: un snapshot REPEATABLE READ anterior no ignora la escritura tras esperar.
        UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        RETURN NEW;
      END $$;
      CREATE TRIGGER calificaciones_abiertas_validacion BEFORE INSERT OR UPDATE ON calificaciones
        FOR EACH ROW EXECUTE FUNCTION validar_calificacion_abierta();
      CREATE TRIGGER calificaciones_historial_inmutable BEFORE DELETE OR TRUNCATE ON calificaciones
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_historial();

      CREATE FUNCTION sincronizar_resultado_calificaciones() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE grupo bigint;
      BEGIN
        SELECT grupo_id INTO grupo FROM matriculas WHERE id=NEW.matricula_id;
        IF grupo IS NOT NULL THEN
          PERFORM id FROM grupos WHERE id=grupo FOR UPDATE;
          UPDATE grupos SET codigo=codigo WHERE id=grupo;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER resultados_calificaciones_sincronizacion BEFORE INSERT OR UPDATE ON resultados_academicos
        FOR EACH ROW EXECUTE FUNCTION sincronizar_resultado_calificaciones();

      CREATE FUNCTION sincronizar_cierre_calificaciones() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo='ACTA' THEN
          PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
          UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER cierres_calificaciones_sincronizacion BEFORE INSERT ON cierres_academicos
        FOR EACH ROW EXECUTE FUNCTION sincronizar_cierre_calificaciones();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM calificaciones) THEN
          RAISE EXCEPTION 'No se revierte B17 con historial de calificaciones persistido' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER cierres_calificaciones_sincronizacion ON cierres_academicos;
      DROP FUNCTION sincronizar_cierre_calificaciones();
      DROP TRIGGER resultados_calificaciones_sincronizacion ON resultados_academicos;
      DROP FUNCTION sincronizar_resultado_calificaciones();
      DROP TRIGGER calificaciones_historial_inmutable ON calificaciones;
      DROP TRIGGER calificaciones_abiertas_validacion ON calificaciones;
      DROP FUNCTION validar_calificacion_abierta();
      DROP INDEX calificaciones_grupo;
      ALTER TABLE calificaciones DROP CONSTRAINT calificaciones_fechas_consistentes;
      ALTER TABLE calificaciones DROP CONSTRAINT calificaciones_precision_decimal;
      ALTER TABLE calificaciones ALTER COLUMN nota TYPE numeric(4,2) USING nota::numeric(4,2);
      ALTER TABLE calificaciones DROP COLUMN version;
    `);
  }
}
