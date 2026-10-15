import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B17 ordinario; B18 añade únicamente una excepción administrativa de acta. */
function gradeValidation(afterClosure: boolean): string {
  return `CREATE OR REPLACE FUNCTION validar_calificacion_abierta() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE estado_grupo text; estado_periodo text; estado_matricula text; correccion boolean:=false;
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
      PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
      SELECT g.estado,p.estado INTO estado_grupo,estado_periodo FROM grupos g
        JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=NEW.grupo_id FOR SHARE OF p;
      ${
        afterClosure
          ? `
      IF TG_OP='UPDATE' THEN
        SELECT EXISTS(SELECT 1 FROM cierres_academicos a
          JOIN resultados_academicos r ON r.cierre_id=a.id AND r.matricula_id=NEW.matricula_id
          JOIN matriculas m ON m.id=r.matricula_id AND m.estado='CERRADA'
          JOIN evaluaciones e ON e.configuracion_id=r.configuracion_id AND e.grupo_id=a.grupo_id
          JOIN indicadores_evaluacion i ON i.evaluacion_id=e.id AND i.id=NEW.indicador_id
          WHERE a.grupo_id=NEW.grupo_id AND a.tipo='ACTA' AND a.estado='CERRADO'
            AND COALESCE(current_setting('excel.act_command',true),'')='correct:'||a.id::text)
          INTO correccion;
      END IF;`
          : ''
      }
      IF NOT correccion AND (estado_grupo IS DISTINCT FROM 'ACTIVO' OR estado_periodo IS DISTINCT FROM 'ABIERTO') THEN
        RAISE EXCEPTION 'El grupo y su periodo deben estar abiertos para registrar notas' USING ERRCODE='23514';
      END IF;
      IF NOT correccion AND EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=NEW.grupo_id AND tipo='ACTA' AND estado='CERRADO') THEN
        RAISE EXCEPTION 'El acta está cerrada; la corrección requiere el flujo administrativo' USING ERRCODE='23514';
      END IF;
      SELECT estado INTO estado_matricula FROM matriculas
        WHERE id=NEW.matricula_id AND grupo_id=NEW.grupo_id FOR SHARE;
      IF (NOT correccion AND estado_matricula IS DISTINCT FROM 'ACTIVA')
        OR (correccion AND estado_matricula IS DISTINCT FROM 'CERRADA') THEN
        RAISE EXCEPTION 'El estado de la matrícula no permite esta escritura de notas' USING ERRCODE='23514';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM indicadores_evaluacion i
        JOIN evaluaciones e ON e.id=i.evaluacion_id AND e.grupo_id=i.grupo_id
        JOIN configuraciones_evaluacion_grupo c ON c.id=e.configuracion_id AND c.grupo_id=e.grupo_id
        JOIN planes_evaluacion p ON p.id=c.plan_id AND p.nivel_id=c.nivel_id
        WHERE i.id=NEW.indicador_id AND i.grupo_id=NEW.grupo_id AND i.activo AND e.activo AND p.estado='APROBADO'
        FOR SHARE OF i,e,c,p) THEN
        RAISE EXCEPTION 'La nota requiere un criterio activo de la configuración aprobada aplicada al grupo' USING ERRCODE='23514';
      END IF;
      IF NOT correccion AND EXISTS(SELECT 1 FROM resultados_academicos WHERE matricula_id=NEW.matricula_id FOR SHARE) THEN
        RAISE EXCEPTION 'El intento conserva un resultado académico; su corrección requiere el flujo administrativo posterior' USING ERRCODE='23514';
      END IF;
      IF TG_OP='UPDATE' THEN
        NEW.actualizado_at:=GREATEST(clock_timestamp(),OLD.registrado_at,OLD.actualizado_at);
      END IF;
      UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
      RETURN NEW;
    END $$;`;
}

export class ActasResultados1790208014000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE resultados_academicos
        ADD COLUMN cierre_id bigint REFERENCES cierres_academicos(id),
        ADD COLUMN configuracion_id bigint REFERENCES configuraciones_evaluacion_grupo(id),
        ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
        ADD COLUMN calculo jsonb;
      ALTER TABLE resultados_academicos ALTER COLUMN promedio TYPE numeric USING promedio::numeric;
      ALTER TABLE resultados_academicos ADD CONSTRAINT resultados_precision_exacta
        CHECK(promedio IS NULL OR (promedio BETWEEN 0 AND 20 AND scale(promedio)<=10));
      ALTER TABLE resultados_academicos ADD CONSTRAINT resultados_procedencia_acta CHECK(
        (cierre_id IS NULL AND configuracion_id IS NULL AND calculo IS NULL)
        OR (cierre_id IS NOT NULL AND configuracion_id IS NOT NULL AND calculo IS NOT NULL
          AND jsonb_typeof(calculo)='object' AND confirmado_at IS NOT NULL
          AND calculado_at>=confirmado_at
          AND promedio IS NOT NULL AND nota_oficial IS NOT NULL AND condicion IS NOT NULL));
      CREATE INDEX resultados_cierre ON resultados_academicos(cierre_id) WHERE cierre_id IS NOT NULL;
      CREATE UNIQUE INDEX cierres_acta_unico ON cierres_academicos(grupo_id)
        WHERE tipo='ACTA' AND estado='CERRADO';
      CREATE TRIGGER resultados_historial_inmutable BEFORE TRUNCATE ON resultados_academicos
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_historial();

      -- Integridad derivada: se contrasta al commit con datos persistidos y decimales PostgreSQL.
      CREATE FUNCTION calcular_resultado_acta(matricula bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE intento record; cfg record; asistencia record; notas record; cierre record;
        faltas numeric; porcentaje numeric; oficial integer; condicion_final text;
      BEGIN
        SELECT m.*,p.version AS reglas_version,p.nota_minima,p.inasistencia_max_pct,p.tardanzas_por_falta
          INTO intento FROM matriculas m JOIN parametros_academicos p ON p.id=m.parametro_id WHERE m.id=matricula;
        IF NOT FOUND OR intento.estado NOT IN ('ACTIVA','CERRADA') THEN
          RAISE EXCEPTION 'El resultado requiere un intento activo o cerrado' USING ERRCODE='23514';
        END IF;
        SELECT c.id,c.plan_id,p.version,p.formula,p.estado INTO cfg FROM configuraciones_evaluacion_grupo c
          JOIN planes_evaluacion p ON p.id=c.plan_id WHERE c.grupo_id=intento.grupo_id;
        IF NOT FOUND OR cfg.estado<>'APROBADO' OR cfg.formula<>'PONDERADA_JERARQUICA_V1' THEN
          RAISE EXCEPTION 'El resultado exige criterios aprobados aplicados' USING ERRCODE='23514';
        END IF;
        SELECT id,realizado_at INTO cierre FROM cierres_academicos WHERE grupo_id=intento.grupo_id
          AND tipo='ASISTENCIA' AND estado='CERRADO';
        IF NOT FOUND THEN
          RAISE EXCEPTION 'El acta requiere asistencia cerrada' USING ERRCODE='23514';
        END IF;
        SELECT count(*)::int AS sesiones,count(*) FILTER(WHERE a.id IS NULL)::int AS pendientes,
          count(*) FILTER(WHERE a.codigo='T')::int AS tardanzas,
          count(*) FILTER(WHERE a.codigo='F' OR (a.codigo='J' AND j.estado IS DISTINCT FROM 'RECUPERADA'))::int AS faltas
          INTO asistencia FROM sesiones_clase s
          LEFT JOIN asistencias a ON a.sesion_id=s.id AND a.matricula_id=matricula
          LEFT JOIN justificaciones j ON j.asistencia_id=a.id
          WHERE s.grupo_id=intento.grupo_id AND s.estado='REALIZADA'
            AND s.fecha<=(cierre.realizado_at AT TIME ZONE 'America/Lima')::date;
        IF asistencia.sesiones=0 OR asistencia.pendientes>0 THEN
          RAISE EXCEPTION 'La asistencia debe tener sesiones computables y todas sus marcas' USING ERRCODE='23514';
        END IF;
        SELECT count(i.id)::int AS esperadas,count(c.id)::int AS registradas,
          trim_scale(round(sum(c.nota*e.peso_pct*i.peso_pct)/10000,10)) AS promedio
          INTO notas FROM evaluaciones e JOIN indicadores_evaluacion i ON i.evaluacion_id=e.id AND i.activo
          LEFT JOIN calificaciones c ON c.indicador_id=i.id AND c.matricula_id=matricula
          WHERE e.configuracion_id=cfg.id AND e.activo;
        IF notas.esperadas=0 OR notas.esperadas<>notas.registradas THEN
          RAISE EXCEPTION 'El acta requiere todas las calificaciones' USING ERRCODE='23514';
        END IF;
        faltas:=asistencia.faltas+floor(asistencia.tardanzas::numeric/intento.tardanzas_por_falta);
        porcentaje:=round(faltas*100/asistencia.sesiones,2);
        oficial:=round(notas.promedio)::int;
        condicion_final:=CASE WHEN faltas*100>asistencia.sesiones*intento.inasistencia_max_pct
          THEN 'RETIRADO_INASISTENCIA' WHEN oficial<intento.nota_minima THEN 'DESAPROBADO' ELSE 'APROBADO' END;
        RETURN jsonb_build_object('matriculaId',matricula::text,'grupoId',intento.grupo_id::text,
          'parametroId',intento.parametro_id::text,'configuracionId',cfg.id::text,'planId',cfg.plan_id::text,
          'planVersion',cfg.version,'reglasVersion',intento.reglas_version,'promedio',notas.promedio,
          'notaOficial',oficial,'tardanzasTotal',asistencia.tardanzas,'faltasComputables',faltas,
          'inasistenciaPct',porcentaje,'condicion',condicion_final,'sesionesComputables',asistencia.sesiones,
          'excedeLimite',faltas*100>asistencia.sesiones*intento.inasistencia_max_pct,
          'inasistenciaMaxPct',intento.inasistencia_max_pct,'tardanzasPorFalta',intento.tardanzas_por_falta,
          'calificacionesEsperadas',notas.esperadas,'calificacionesRegistradas',notas.registradas,
          'notaMinima',intento.nota_minima,'cierreAsistenciaId',cierre.id::text);
      END $$;

      CREATE FUNCTION verificar_resultado_acta(resultado bigint) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE actual resultados_academicos%ROWTYPE; esperado jsonb;
      BEGIN
        SELECT * INTO actual FROM resultados_academicos WHERE id=resultado;
        IF NOT FOUND OR actual.cierre_id IS NULL THEN RETURN; END IF;
        esperado:=calcular_resultado_acta(actual.matricula_id);
        IF actual.configuracion_id::text IS DISTINCT FROM esperado->>'configuracionId'
          OR actual.promedio IS DISTINCT FROM (esperado->>'promedio')::numeric
          OR actual.nota_oficial IS DISTINCT FROM (esperado->>'notaOficial')::integer
          OR actual.tardanzas_total IS DISTINCT FROM (esperado->>'tardanzasTotal')::integer
          OR actual.faltas_equivalentes IS DISTINCT FROM (esperado->>'faltasComputables')::numeric
          OR actual.inasistencia_pct IS DISTINCT FROM (esperado->>'inasistenciaPct')::numeric
          OR actual.condicion IS DISTINCT FROM esperado->>'condicion' THEN
          RAISE EXCEPTION 'El resultado del acta debe coincidir con notas y asistencia persistidas' USING ERRCODE='23514';
        END IF;
        IF actual.calculo->>'parametroId' IS DISTINCT FROM esperado->>'parametroId'
          OR (actual.calculo->>'notaMinima')::numeric IS DISTINCT FROM (esperado->>'notaMinima')::numeric
          OR actual.calculo->>'configuracionId' IS DISTINCT FROM esperado->>'configuracionId'
          OR actual.calculo->>'planId' IS DISTINCT FROM esperado->>'planId'
          OR actual.calculo->'planVersion' IS DISTINCT FROM esperado->'planVersion' THEN
          RAISE EXCEPTION 'El cálculo debe conservar la procedencia de las reglas y criterios' USING ERRCODE='23514';
        END IF;
        IF (actual.calculo#>>'{resumenNotas,promedio}')::numeric IS DISTINCT FROM actual.promedio
          OR (actual.calculo#>>'{resumenNotas,notaOficial}')::integer IS DISTINCT FROM actual.nota_oficial
          OR actual.calculo#>'{resumenNotas,configuracionAprobada}' IS DISTINCT FROM 'true'::jsonb
          OR actual.calculo#>'{resumenNotas,calificacionesEsperadas}' IS DISTINCT FROM esperado->'calificacionesEsperadas'
          OR actual.calculo#>'{resumenNotas,calificacionesRegistradas}' IS DISTINCT FROM esperado->'calificacionesRegistradas'
          OR actual.calculo#>'{resumenNotas,calificacionesPendientes}' IS DISTINCT FROM '0'::jsonb
          OR (actual.calculo#>>'{resumenAsistencia,sesionesComputables}')::integer IS DISTINCT FROM (esperado->>'sesionesComputables')::integer
          OR (actual.calculo#>>'{resumenAsistencia,faltasComputables}')::numeric IS DISTINCT FROM actual.faltas_equivalentes
          OR (actual.calculo#>>'{resumenAsistencia,tardanzas}')::integer IS DISTINCT FROM actual.tardanzas_total
          OR (actual.calculo#>>'{resumenAsistencia,inasistenciaPct}')::numeric IS DISTINCT FROM actual.inasistencia_pct
          OR actual.calculo#>'{resumenAsistencia,excedeLimite}' IS DISTINCT FROM esperado->'excedeLimite'
          OR actual.calculo#>'{resumenAsistencia,marcasPendientes}' IS DISTINCT FROM '0'::jsonb
          OR actual.calculo#>>'{resumenAsistencia,reglas,parametroId}' IS DISTINCT FROM esperado->>'parametroId'
          OR actual.calculo#>'{resumenAsistencia,reglas,version}' IS DISTINCT FROM esperado->'reglasVersion'
          OR (actual.calculo#>>'{resumenAsistencia,reglas,inasistenciaMaxPct}')::numeric IS DISTINCT FROM (esperado->>'inasistenciaMaxPct')::numeric
          OR actual.calculo#>'{resumenAsistencia,reglas,tardanzasPorFalta}' IS DISTINCT FROM esperado->'tardanzasPorFalta'
          OR actual.calculo#>'{resumenAsistencia,cierreConfirmado}' IS DISTINCT FROM 'true'::jsonb
          OR actual.calculo#>>'{resumenAsistencia,estado}' IS DISTINCT FROM 'CALCULADO' THEN
          RAISE EXCEPTION 'El snapshot debe reflejar el cálculo completo confirmado' USING ERRCODE='23514';
        END IF;
      END $$;

      CREATE OR REPLACE FUNCTION registrar_cierre_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE grupo record; intento record;
      BEGIN
        IF NEW.estado<>'CERRADO' THEN
          RAISE EXCEPTION 'La reapertura de un cierre no está disponible' USING ERRCODE='23514';
        END IF;
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        IF NEW.tipo='ACTA' THEN
          IF COALESCE(current_setting('excel.act_command',true),'')<>'close:'||NEW.grupo_id::text THEN
            RAISE EXCEPTION 'El acta requiere el contexto transaccional de cierre' USING ERRCODE='23514';
          END IF;
          SELECT g.estado,p.estado AS periodo_estado INTO grupo FROM grupos g
            JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=NEW.grupo_id FOR SHARE OF p;
          IF grupo.estado NOT IN ('ACTIVO','CERRADO') OR grupo.periodo_estado NOT IN ('ABIERTO','CERRADO') THEN
            RAISE EXCEPTION 'El grupo y periodo no permiten cerrar el acta' USING ERRCODE='23514';
          END IF;
          IF EXISTS(SELECT 1 FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=NEW.grupo_id) THEN
            RAISE EXCEPTION 'Los resultados anteriores deben reconciliarse antes de cerrar el acta' USING ERRCODE='23514';
          END IF;
          IF NOT EXISTS(SELECT 1 FROM matriculas WHERE grupo_id=NEW.grupo_id AND estado IN ('ACTIVA','CERRADA')) THEN
            RAISE EXCEPTION 'El acta requiere al menos una matrícula revisable' USING ERRCODE='23514';
          END IF;
          FOR intento IN SELECT id FROM matriculas WHERE grupo_id=NEW.grupo_id AND estado IN ('ACTIVA','CERRADA') ORDER BY id LOOP
            PERFORM calcular_resultado_acta(intento.id);
          END LOOP;
        END IF;
        UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        RETURN NEW;
      END $$;

      CREATE FUNCTION validar_resultado_acta() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cierre record; grupo bigint;
      BEGIN
        SELECT grupo_id INTO grupo FROM matriculas WHERE id=NEW.matricula_id;
        PERFORM id FROM grupos WHERE id=grupo FOR UPDATE;
        IF TG_OP='UPDATE' THEN
          IF OLD.cierre_id IS NULL THEN
            RAISE EXCEPTION 'El resultado histórico sin procedencia no se sustituye por un acta nueva' USING ERRCODE='23001';
          END IF;
          IF ROW(NEW.id,NEW.matricula_id,NEW.cierre_id,NEW.configuracion_id,NEW.confirmado_at)
            IS DISTINCT FROM ROW(OLD.id,OLD.matricula_id,OLD.cierre_id,OLD.configuracion_id,OLD.confirmado_at) THEN
            RAISE EXCEPTION 'La procedencia y confirmación original del resultado se conserva' USING ERRCODE='23001';
          END IF;
          IF NEW.version<>OLD.version+1 THEN
            RAISE EXCEPTION 'La corrección debe avanzar la versión del resultado' USING ERRCODE='23514';
          END IF;
        ELSIF NEW.version<>1 THEN
          RAISE EXCEPTION 'Un resultado nuevo comienza en versión 1' USING ERRCODE='23514';
        END IF;
        IF NEW.cierre_id IS NULL THEN
          IF EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=grupo AND tipo='ACTA' AND estado='CERRADO') THEN
            RAISE EXCEPTION 'El grupo cerrado no admite resultados sin procedencia' USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END IF;
        SELECT * INTO cierre FROM cierres_academicos WHERE id=NEW.cierre_id
          AND grupo_id=grupo AND tipo='ACTA' AND estado='CERRADO';
        IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM configuraciones_evaluacion_grupo WHERE id=NEW.configuracion_id AND grupo_id=grupo) THEN
          RAISE EXCEPTION 'El resultado debe pertenecer al acta y configuración de su grupo' USING ERRCODE='23514';
        END IF;
        IF (TG_OP='INSERT' AND COALESCE(current_setting('excel.act_command',true),'')<>'close:'||grupo::text)
          OR (TG_OP='UPDATE' AND COALESCE(current_setting('excel.act_command',true),'')<>'correct:'||cierre.id::text) THEN
          RAISE EXCEPTION 'El resultado requiere el contexto transaccional de cierre o corrección' USING ERRCODE='23514';
        END IF;
        IF NEW.confirmado_at IS DISTINCT FROM cierre.realizado_at THEN
          RAISE EXCEPTION 'La confirmación del resultado corresponde al cierre original' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' THEN
          NEW.calculado_at:=GREATEST(clock_timestamp(),OLD.calculado_at,cierre.realizado_at);
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER resultados_acta_validacion BEFORE INSERT OR UPDATE ON resultados_academicos
        FOR EACH ROW EXECUTE FUNCTION validar_resultado_acta();

      CREATE FUNCTION comprobar_resultado_acta() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM verificar_resultado_acta(NEW.id); RETURN NULL; END $$;
      CREATE CONSTRAINT TRIGGER resultados_acta_consistencia AFTER INSERT OR UPDATE ON resultados_academicos
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_resultado_acta();
      CREATE FUNCTION comprobar_acta_completa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo='ACTA' AND (NOT EXISTS(SELECT 1 FROM resultados_academicos WHERE cierre_id=NEW.id)
          OR EXISTS(SELECT 1 FROM matriculas m LEFT JOIN resultados_academicos r ON r.matricula_id=m.id AND r.cierre_id=NEW.id
            WHERE m.grupo_id=NEW.grupo_id AND m.estado IN ('ACTIVA','CERRADA') AND (m.estado<>'CERRADA' OR r.id IS NULL))) THEN
          RAISE EXCEPTION 'El cierre exige resultados confirmados y matrículas cerradas en la misma transacción' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER actas_resultados_completos AFTER INSERT ON cierres_academicos
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_acta_completa();

      CREATE FUNCTION proteger_asistencia_acta() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE acta bigint;
      BEGIN
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        SELECT id INTO acta FROM cierres_academicos WHERE grupo_id=NEW.grupo_id AND tipo='ACTA' AND estado='CERRADO';
        IF acta IS NOT NULL THEN
          IF COALESCE(current_setting('excel.act_command',true),'')<>'correct:'||acta::text
            OR NOT EXISTS(SELECT 1 FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id
              WHERE r.cierre_id=acta AND m.id=NEW.matricula_id AND m.estado='CERRADA') THEN
            RAISE EXCEPTION 'La corrección de asistencia del acta requiere su resultado y contexto administrativo' USING ERRCODE='23514';
          END IF;
          IF NOT EXISTS(SELECT 1 FROM sesiones_clase s JOIN cierres_academicos c ON c.grupo_id=s.grupo_id
            AND c.tipo='ASISTENCIA' AND c.estado='CERRADO' WHERE s.id=NEW.sesion_id AND s.estado='REALIZADA'
              AND s.fecha<=(c.realizado_at AT TIME ZONE 'America/Lima')::date) THEN
            RAISE EXCEPTION 'La corrección debe pertenecer a una sesión computable del acta' USING ERRCODE='23514';
          END IF;
          UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER asistencias_acta_administrativo BEFORE INSERT OR UPDATE ON asistencias
        FOR EACH ROW EXECUTE FUNCTION proteger_asistencia_acta();
      CREATE FUNCTION comprobar_recalculo_acta() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE resultado bigint;
      BEGIN
        SELECT id INTO resultado FROM resultados_academicos WHERE matricula_id=NEW.matricula_id AND cierre_id IS NOT NULL;
        IF resultado IS NOT NULL THEN PERFORM verificar_resultado_acta(resultado); END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER calificaciones_acta_recalculo AFTER INSERT OR UPDATE ON calificaciones
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_recalculo_acta();
      CREATE CONSTRAINT TRIGGER asistencias_acta_recalculo AFTER INSERT OR UPDATE ON asistencias
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_recalculo_acta();

      CREATE FUNCTION conservar_matricula_acta() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE acta bigint;
      BEGIN
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
        SELECT id INTO acta FROM cierres_academicos WHERE grupo_id=NEW.grupo_id AND tipo='ACTA' AND estado='CERRADO';
        IF acta IS NOT NULL THEN
          IF TG_OP='INSERT' THEN
            RAISE EXCEPTION 'El padrón del acta cerrada conserva sus intentos' USING ERRCODE='23514';
          END IF;
          IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
            OLD.estado='ACTIVA' AND NEW.estado='CERRADA'
            AND COALESCE(current_setting('excel.act_command',true),'')='close:'||NEW.grupo_id::text
            AND EXISTS(SELECT 1 FROM resultados_academicos WHERE matricula_id=OLD.id AND cierre_id=acta)) THEN
            RAISE EXCEPTION 'La matrícula conserva el cierre y resultado de su intento' USING ERRCODE='23001';
          END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER matriculas_acta_conservada BEFORE INSERT OR UPDATE ON matriculas
        FOR EACH ROW EXECUTE FUNCTION conservar_matricula_acta();
    `);
    await r.query(gradeValidation(true));
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM cierres_academicos WHERE tipo='ACTA')
          OR EXISTS(SELECT 1 FROM resultados_academicos WHERE cierre_id IS NOT NULL) THEN
          RAISE EXCEPTION 'No se revierte B18 con actas o resultados confirmados persistidos' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM resultados_academicos WHERE promedio IS DISTINCT FROM round(promedio,2)) THEN
          RAISE EXCEPTION 'No se revierte B18 si se pierde precisión del promedio histórico' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER matriculas_acta_conservada ON matriculas;
      DROP FUNCTION conservar_matricula_acta();
      DROP TRIGGER asistencias_acta_recalculo ON asistencias;
      DROP TRIGGER calificaciones_acta_recalculo ON calificaciones;
      DROP FUNCTION comprobar_recalculo_acta();
      DROP TRIGGER asistencias_acta_administrativo ON asistencias;
      DROP FUNCTION proteger_asistencia_acta();
      DROP TRIGGER actas_resultados_completos ON cierres_academicos;
      DROP FUNCTION comprobar_acta_completa();
      DROP TRIGGER resultados_acta_consistencia ON resultados_academicos;
      DROP FUNCTION comprobar_resultado_acta();
      DROP TRIGGER resultados_acta_validacion ON resultados_academicos;
      DROP FUNCTION validar_resultado_acta();
      DROP FUNCTION verificar_resultado_acta(bigint);
      DROP FUNCTION calcular_resultado_acta(bigint);
      DROP TRIGGER resultados_historial_inmutable ON resultados_academicos;
      DROP INDEX cierres_acta_unico;
      DROP INDEX resultados_cierre;
      ALTER TABLE resultados_academicos DROP CONSTRAINT resultados_procedencia_acta;
      ALTER TABLE resultados_academicos DROP CONSTRAINT resultados_precision_exacta;
      ALTER TABLE resultados_academicos ALTER COLUMN promedio TYPE numeric(5,2) USING promedio::numeric(5,2);
      ALTER TABLE resultados_academicos DROP COLUMN calculo,DROP COLUMN version,DROP COLUMN configuracion_id,DROP COLUMN cierre_id;
      CREATE OR REPLACE FUNCTION registrar_cierre_asistencia() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo<>'ASISTENCIA' OR NEW.estado<>'CERRADO' THEN
          RAISE EXCEPTION 'B15 únicamente registra el cierre de asistencia; actas y reapertura no están disponibles' USING ERRCODE='23514';
        END IF;
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        RETURN NEW;
      END $$;
    `);
    await r.query(gradeValidation(false));
  }
}
