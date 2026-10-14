import type { MigrationInterface, QueryRunner } from 'typeorm';

/** B16: versiones aprobadas por nivel y snapshots inmutables, sin aprobar datos antiguos. */
export class PlanesEvaluacion1790208012000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE planes_evaluacion (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nivel_id bigint NOT NULL REFERENCES niveles(id),
        version integer NOT NULL CHECK(version>0),
        nombre varchar(120) NOT NULL CHECK(length(btrim(nombre))>0),
        formula varchar(40) NOT NULL CHECK(formula='PONDERADA_JERARQUICA_V1'),
        estructura jsonb NOT NULL CHECK(jsonb_typeof(estructura)='object'),
        estado varchar(15) NOT NULL DEFAULT 'BORRADOR' CHECK(estado IN ('BORRADOR','APROBADO')),
        revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
        creado_por bigint NOT NULL REFERENCES usuarios(id),
        creado_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_at timestamptz,
        aprobado_por bigint REFERENCES usuarios(id),
        aprobado_at timestamptz,
        referencia_aprobacion varchar(400) CHECK(referencia_aprobacion IS NULL OR length(btrim(referencia_aprobacion))>0),
        UNIQUE(nivel_id,version), UNIQUE(id,nivel_id),
        CHECK(actualizado_at IS NULL OR actualizado_at>=creado_at),
        CHECK(aprobado_at IS NULL OR aprobado_at>=creado_at),
        CHECK((estado='BORRADOR' AND aprobado_por IS NULL AND aprobado_at IS NULL AND referencia_aprobacion IS NULL)
          OR (estado='APROBADO' AND aprobado_por IS NOT NULL AND aprobado_at IS NOT NULL AND referencia_aprobacion IS NOT NULL))
      );
      CREATE TABLE configuraciones_evaluacion_grupo (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        grupo_id bigint NOT NULL UNIQUE,
        nivel_id bigint NOT NULL,
        plan_id bigint NOT NULL,
        FOREIGN KEY(grupo_id,nivel_id) REFERENCES grupos(id,nivel_id),
        FOREIGN KEY(plan_id,nivel_id) REFERENCES planes_evaluacion(id,nivel_id),
        aplicado_por bigint NOT NULL REFERENCES usuarios(id),
        aplicado_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE evaluaciones ADD COLUMN configuracion_id bigint REFERENCES configuraciones_evaluacion_grupo(id);
      CREATE INDEX evaluaciones_configuracion ON evaluaciones(configuracion_id);

      CREATE FUNCTION normalizar_estructura_evaluacion(definicion jsonb,nivel bigint,completa boolean)
        RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE componente jsonb; indicador jsonb; normalizados jsonb:='[]'::jsonb; entradas jsonb;
        nombre text; codigo text; descripcion text; unidad text; orden_e numeric; orden_i numeric;
        peso_e numeric; peso_i numeric; total_e numeric:=0; total_i numeric; cantidad_i integer:=0;
        nombres text[]:=ARRAY[]::text[]; ordenes_e integer[]:=ARRAY[]::integer[];
        codigos text[]; ordenes_i integer[]; unidades bigint[]:=ARRAY[]::bigint[];
        nivel_activo boolean; idioma_activo boolean;
      BEGIN
        IF jsonb_typeof(definicion) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'La estructura de evaluación debe ser un objeto' USING ERRCODE='23514';
        END IF;
        IF NOT (definicion ? 'evaluaciones') OR EXISTS(SELECT 1 FROM jsonb_object_keys(definicion) AS k(clave) WHERE clave<>'evaluaciones') THEN
          RAISE EXCEPTION 'La estructura contiene campos no permitidos' USING ERRCODE='23514';
        END IF;
        IF jsonb_typeof(definicion->'evaluaciones') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'La estructura requiere una lista de evaluaciones' USING ERRCODE='23514';
        END IF;
        IF jsonb_array_length(definicion->'evaluaciones')>20 THEN
          RAISE EXCEPTION 'La definición admite como máximo 20 evaluaciones' USING ERRCODE='23514';
        END IF;
        SELECT n.activo,i.activo INTO nivel_activo,idioma_activo FROM niveles n JOIN idiomas i ON i.id=n.idioma_id
          WHERE n.id=nivel FOR SHARE OF n,i;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'El nivel del plan no existe' USING ERRCODE='23503';
        END IF;
        IF NOT nivel_activo OR NOT idioma_activo THEN
          RAISE EXCEPTION 'El nivel y el idioma deben estar activos para configurar evaluaciones' USING ERRCODE='23514';
        END IF;
        -- Bloquea las referencias en un orden único antes de validar cada componente.
        FOR componente IN SELECT value FROM jsonb_array_elements(definicion->'evaluaciones') LOOP
          IF jsonb_typeof(componente) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Cada evaluación debe ser un objeto' USING ERRCODE='23514';
          END IF;
          IF jsonb_typeof(componente->'unidadId')='string' THEN
            unidad:=componente->>'unidadId';
            IF unidad !~ '^[1-9][0-9]{0,18}$' THEN
              RAISE EXCEPTION 'La unidad debe ser un identificador válido' USING ERRCODE='23514';
            END IF;
            IF unidad::numeric>9223372036854775807 THEN
              RAISE EXCEPTION 'La unidad debe ser un identificador válido' USING ERRCODE='23514';
            END IF;
            unidades:=array_append(unidades,unidad::bigint);
          ELSIF jsonb_typeof(componente->'unidadId') IS DISTINCT FROM 'null' THEN
            RAISE EXCEPTION 'La unidad debe ser texto o null' USING ERRCODE='23514';
          END IF;
        END LOOP;
        PERFORM id FROM unidades_didacticas WHERE id=ANY(unidades) ORDER BY id FOR UPDATE;
        -- Impide que un DELETE o cambio de nivel con snapshot antiguo ignore la referencia JSON recién creada.
        UPDATE unidades_didacticas AS u SET nombre=u.nombre WHERE u.id=ANY(unidades);
        FOR componente IN SELECT value FROM jsonb_array_elements(definicion->'evaluaciones') LOOP
          IF jsonb_typeof(componente) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Cada evaluación debe ser un objeto' USING ERRCODE='23514';
          END IF;
          IF NOT (componente ?& ARRAY['nombre','unidadId','pesoPct','orden','indicadores'])
            OR EXISTS(SELECT 1 FROM jsonb_object_keys(componente) AS k(clave) WHERE clave NOT IN ('nombre','unidadId','pesoPct','orden','indicadores')) THEN
            RAISE EXCEPTION 'Los campos de la evaluación no son válidos' USING ERRCODE='23514';
          END IF;
          IF jsonb_typeof(componente->'nombre') IS DISTINCT FROM 'string'
            OR jsonb_typeof(componente->'pesoPct') IS DISTINCT FROM 'string'
            OR jsonb_typeof(componente->'orden') IS DISTINCT FROM 'number'
            OR jsonb_typeof(componente->'indicadores') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Los tipos de la evaluación no son válidos' USING ERRCODE='23514';
          END IF;
          nombre:=btrim(componente->>'nombre');
          orden_e:=(componente->>'orden')::numeric;
          IF length(nombre)<1 OR length(nombre)>120 OR orden_e<1 OR orden_e>32767 OR orden_e<>trunc(orden_e) THEN
            RAISE EXCEPTION 'El nombre o el orden de la evaluación no es válido' USING ERRCODE='23514';
          END IF;
          IF nombre=ANY(nombres) OR orden_e::integer=ANY(ordenes_e) THEN
            RAISE EXCEPTION 'No se repiten nombres ni órdenes de evaluaciones' USING ERRCODE='23514';
          END IF;
          nombres:=array_append(nombres,nombre); ordenes_e:=array_append(ordenes_e,orden_e::integer);
          IF (componente->>'pesoPct') !~ '^[0-9]{1,3}(\\.[0-9]{1,2})?$' THEN
            RAISE EXCEPTION 'El peso debe ser decimal positivo con hasta dos decimales' USING ERRCODE='23514';
          END IF;
          peso_e:=(componente->>'pesoPct')::numeric;
          IF peso_e<=0 OR peso_e>100 THEN
            RAISE EXCEPTION 'El peso debe ser mayor que 0 y no superar 100' USING ERRCODE='23514';
          END IF;
          unidad:=NULL;
          IF jsonb_typeof(componente->'unidadId')='string' THEN
            unidad:=componente->>'unidadId';
            IF unidad !~ '^[1-9][0-9]{0,18}$' THEN
              RAISE EXCEPTION 'La unidad debe ser un identificador válido' USING ERRCODE='23514';
            END IF;
            IF unidad::numeric>9223372036854775807 THEN
              RAISE EXCEPTION 'La unidad debe ser un identificador válido' USING ERRCODE='23514';
            END IF;
            PERFORM id FROM unidades_didacticas WHERE id=unidad::bigint AND nivel_id=nivel AND activo FOR UPDATE;
            IF NOT FOUND THEN
              RAISE EXCEPTION 'La unidad debe estar activa y pertenecer al mismo nivel' USING ERRCODE='23514';
            END IF;
          ELSIF jsonb_typeof(componente->'unidadId') IS DISTINCT FROM 'null' THEN
            RAISE EXCEPTION 'La unidad debe ser texto o null' USING ERRCODE='23514';
          END IF;
          IF jsonb_array_length(componente->'indicadores')>30 THEN
            RAISE EXCEPTION 'Cada evaluación admite como máximo 30 indicadores' USING ERRCODE='23514';
          END IF;
          entradas:='[]'::jsonb; total_i:=0; codigos:=ARRAY[]::text[]; ordenes_i:=ARRAY[]::integer[];
          FOR indicador IN SELECT value FROM jsonb_array_elements(componente->'indicadores') LOOP
            IF jsonb_typeof(indicador) IS DISTINCT FROM 'object' THEN
              RAISE EXCEPTION 'Cada indicador debe ser un objeto' USING ERRCODE='23514';
            END IF;
            IF NOT (indicador ?& ARRAY['codigo','descripcion','pesoPct','orden'])
              OR EXISTS(SELECT 1 FROM jsonb_object_keys(indicador) AS k(clave) WHERE clave NOT IN ('codigo','descripcion','pesoPct','orden')) THEN
              RAISE EXCEPTION 'Los campos del indicador no son válidos' USING ERRCODE='23514';
            END IF;
            IF jsonb_typeof(indicador->'codigo') IS DISTINCT FROM 'string'
              OR jsonb_typeof(indicador->'descripcion') IS DISTINCT FROM 'string'
              OR jsonb_typeof(indicador->'pesoPct') IS DISTINCT FROM 'string'
              OR jsonb_typeof(indicador->'orden') IS DISTINCT FROM 'number' THEN
              RAISE EXCEPTION 'Los tipos del indicador no son válidos' USING ERRCODE='23514';
            END IF;
            codigo:=btrim(indicador->>'codigo'); descripcion:=btrim(indicador->>'descripcion'); orden_i:=(indicador->>'orden')::numeric;
            IF length(codigo)<1 OR length(codigo)>20 OR length(descripcion)<1 OR length(descripcion)>250
              OR orden_i<1 OR orden_i>32767 OR orden_i<>trunc(orden_i) THEN
              RAISE EXCEPTION 'El código, descripción u orden del indicador no es válido' USING ERRCODE='23514';
            END IF;
            IF codigo=ANY(codigos) OR orden_i::integer=ANY(ordenes_i) THEN
              RAISE EXCEPTION 'No se repiten códigos ni órdenes dentro de una evaluación' USING ERRCODE='23514';
            END IF;
            codigos:=array_append(codigos,codigo); ordenes_i:=array_append(ordenes_i,orden_i::integer);
            IF (indicador->>'pesoPct') !~ '^[0-9]{1,3}(\\.[0-9]{1,2})?$' THEN
              RAISE EXCEPTION 'El peso debe ser decimal positivo con hasta dos decimales' USING ERRCODE='23514';
            END IF;
            peso_i:=(indicador->>'pesoPct')::numeric;
            IF peso_i<=0 OR peso_i>100 THEN
              RAISE EXCEPTION 'El peso debe ser mayor que 0 y no superar 100' USING ERRCODE='23514';
            END IF;
            total_i:=total_i+peso_i; cantidad_i:=cantidad_i+1;
            entradas:=entradas || jsonb_build_array(jsonb_build_object('codigo',codigo,'descripcion',descripcion,
              'pesoPct',to_char(peso_i,'FM990.00'),'orden',orden_i::integer));
          END LOOP;
          IF completa AND (jsonb_array_length(entradas)=0 OR total_i<>100) THEN
            RAISE EXCEPTION 'Cada evaluación aprobada requiere indicadores con suma exacta 100.00' USING ERRCODE='23514';
          END IF;
          SELECT COALESCE(jsonb_agg(value ORDER BY (value->>'orden')::integer),'[]'::jsonb) INTO entradas FROM jsonb_array_elements(entradas);
          total_e:=total_e+peso_e;
          normalizados:=normalizados || jsonb_build_array(jsonb_build_object('nombre',nombre,'unidadId',unidad,
            'pesoPct',to_char(peso_e,'FM990.00'),'orden',orden_e::integer,'indicadores',entradas));
        END LOOP;
        IF cantidad_i>100 THEN
          RAISE EXCEPTION 'La definición admite como máximo 100 indicadores' USING ERRCODE='23514';
        END IF;
        IF completa AND (jsonb_array_length(normalizados)=0 OR total_e<>100) THEN
          RAISE EXCEPTION 'El plan aprobado requiere evaluaciones con suma exacta 100.00' USING ERRCODE='23514';
        END IF;
        SELECT COALESCE(jsonb_agg(value ORDER BY (value->>'orden')::integer),'[]'::jsonb) INTO normalizados FROM jsonb_array_elements(normalizados);
        RETURN jsonb_build_object('evaluaciones',normalizados);
      END $$;

      CREATE FUNCTION validar_plan_evaluacion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='INSERT' THEN
          IF NEW.estado<>'BORRADOR' OR NEW.revision<>1 THEN
            RAISE EXCEPTION 'Un plan inicia como borrador con revisión 1' USING ERRCODE='23514';
          END IF;
        ELSE
          IF OLD.estado='APROBADO' THEN
            RAISE EXCEPTION 'El plan aprobado se conserva sin modificaciones' USING ERRCODE='23001';
          END IF;
          IF ROW(NEW.id,NEW.nivel_id,NEW.version,NEW.creado_por,NEW.creado_at)
            IS DISTINCT FROM ROW(OLD.id,OLD.nivel_id,OLD.version,OLD.creado_por,OLD.creado_at) THEN
            RAISE EXCEPTION 'La identidad, versión y origen del plan se conservan' USING ERRCODE='23001';
          END IF;
          IF NEW.revision<>OLD.revision+1 THEN
            RAISE EXCEPTION 'La revisión del borrador debe avanzar exactamente una unidad' USING ERRCODE='23514';
          END IF;
        END IF;
        NEW.estructura:=normalizar_estructura_evaluacion(NEW.estructura,NEW.nivel_id,NEW.estado='APROBADO');
        RETURN NEW;
      END $$;
      CREATE TRIGGER planes_evaluacion_validacion BEFORE INSERT OR UPDATE ON planes_evaluacion
        FOR EACH ROW EXECUTE FUNCTION validar_plan_evaluacion();
      CREATE TRIGGER planes_evaluacion_historial BEFORE DELETE OR TRUNCATE ON planes_evaluacion
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_historial();
      CREATE TRIGGER configuraciones_evaluacion_inmutables BEFORE UPDATE OR DELETE OR TRUNCATE ON configuraciones_evaluacion_grupo
        FOR EACH STATEMENT EXECUTE FUNCTION proteger_historial();

      CREATE FUNCTION aplicar_plan_evaluacion() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE estado_grupo text; estado_periodo text; estado_acta text; plan planes_evaluacion%ROWTYPE;
      BEGIN
        PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR UPDATE;
        SELECT g.estado,p.estado INTO estado_grupo,estado_periodo FROM grupos g
          JOIN periodos_academicos p ON p.id=g.periodo_id WHERE g.id=NEW.grupo_id FOR SHARE OF p;
        IF estado_grupo IS NULL OR estado_grupo NOT IN ('ACTIVO','PLANIFICADO') OR estado_periodo NOT IN ('ABIERTO','PLANIFICADO') THEN
          RAISE EXCEPTION 'El grupo y su periodo deben permitir la configuración de evaluaciones' USING ERRCODE='23514';
        END IF;
        SELECT estado INTO estado_acta FROM cierres_academicos WHERE grupo_id=NEW.grupo_id AND tipo='ACTA' ORDER BY id DESC LIMIT 1;
        IF estado_acta='CERRADO' THEN
          RAISE EXCEPTION 'El acta cerrada conserva sus criterios de evaluación' USING ERRCODE='23514';
        END IF;
        SELECT * INTO plan FROM planes_evaluacion WHERE id=NEW.plan_id FOR SHARE;
        IF NOT FOUND OR plan.estado<>'APROBADO' OR plan.nivel_id<>NEW.nivel_id THEN
          RAISE EXCEPTION 'La configuración requiere un plan aprobado del mismo nivel' USING ERRCODE='23514';
        END IF;
        PERFORM normalizar_estructura_evaluacion(plan.estructura,plan.nivel_id,true);
        IF EXISTS(SELECT 1 FROM configuraciones_evaluacion_grupo WHERE grupo_id=NEW.grupo_id) THEN
          RAISE EXCEPTION 'El grupo ya conserva una configuración de evaluación' USING ERRCODE='23505';
        END IF;
        IF EXISTS(SELECT 1 FROM evaluaciones WHERE grupo_id=NEW.grupo_id)
          OR EXISTS(SELECT 1 FROM indicadores_evaluacion WHERE grupo_id=NEW.grupo_id)
          OR EXISTS(SELECT 1 FROM calificaciones WHERE grupo_id=NEW.grupo_id)
          OR EXISTS(SELECT 1 FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=NEW.grupo_id) THEN
          RAISE EXCEPTION 'Los registros académicos existentes no se sustituyen por una nueva configuración' USING ERRCODE='23514';
        END IF;
        UPDATE grupos SET codigo=codigo WHERE id=NEW.grupo_id;
        RETURN NEW;
      END $$;
      CREATE TRIGGER configuraciones_evaluacion_aplicacion BEFORE INSERT ON configuraciones_evaluacion_grupo
        FOR EACH ROW EXECUTE FUNCTION aplicar_plan_evaluacion();

      CREATE FUNCTION proteger_evaluaciones_configuradas() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configuracion bigint;
      BEGIN
        IF TG_OP='UPDATE' AND (OLD.configuracion_id IS NOT NULL OR NEW.configuracion_id IS NOT NULL) THEN
          RAISE EXCEPTION 'La evaluación aplicada se conserva sin modificaciones' USING ERRCODE='23001';
        END IF;
        IF TG_OP='UPDATE' THEN
          PERFORM id FROM grupos WHERE id IN (OLD.grupo_id,NEW.grupo_id) ORDER BY id FOR SHARE;
        ELSE
          PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
        END IF;
        SELECT id INTO configuracion FROM configuraciones_evaluacion_grupo WHERE grupo_id=NEW.grupo_id;
        IF NEW.configuracion_id IS NULL THEN
          IF configuracion IS NOT NULL THEN
            RAISE EXCEPTION 'El grupo configurado no admite evaluaciones ajenas al plan' USING ERRCODE='23514';
          END IF;
        ELSIF configuracion IS NULL OR configuracion<>NEW.configuracion_id OR NOT NEW.activo
          OR COALESCE(current_setting('excel.evaluation_configuration',true),'')<>configuracion::text THEN
          RAISE EXCEPTION 'La evaluación debe insertarse con el contexto de su configuración inicial' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER evaluaciones_configuradas BEFORE INSERT OR UPDATE ON evaluaciones
        FOR EACH ROW EXECUTE FUNCTION proteger_evaluaciones_configuradas();

      CREATE FUNCTION proteger_indicadores_configurados() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configuracion bigint; anterior bigint;
      BEGIN
        SELECT configuracion_id INTO configuracion FROM evaluaciones WHERE id=NEW.evaluacion_id;
        IF TG_OP='UPDATE' THEN
          SELECT configuracion_id INTO anterior FROM evaluaciones WHERE id=OLD.evaluacion_id;
          IF configuracion IS NOT NULL OR anterior IS NOT NULL THEN
            RAISE EXCEPTION 'El indicador aplicado se conserva sin modificaciones' USING ERRCODE='23001';
          END IF;
          PERFORM id FROM grupos WHERE id IN (OLD.grupo_id,NEW.grupo_id) ORDER BY id FOR SHARE;
        ELSE
          PERFORM id FROM grupos WHERE id=NEW.grupo_id FOR SHARE;
        END IF;
        IF configuracion IS NULL THEN
          IF EXISTS(SELECT 1 FROM configuraciones_evaluacion_grupo WHERE grupo_id=NEW.grupo_id) THEN
            RAISE EXCEPTION 'El grupo configurado no admite indicadores ajenos al plan' USING ERRCODE='23514';
          END IF;
        ELSIF NOT NEW.activo OR COALESCE(current_setting('excel.evaluation_configuration',true),'')<>configuracion::text THEN
          RAISE EXCEPTION 'El indicador debe insertarse con el contexto de su configuración inicial' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER indicadores_configurados BEFORE INSERT OR UPDATE ON indicadores_evaluacion
        FOR EACH ROW EXECUTE FUNCTION proteger_indicadores_configurados();

      CREATE FUNCTION comprobar_snapshot_evaluacion() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configuracion bigint; grupo bigint; esperado jsonb; real jsonb;
      BEGIN
        IF TG_TABLE_NAME='configuraciones_evaluacion_grupo' THEN configuracion:=NEW.id;
        ELSIF TG_TABLE_NAME='evaluaciones' THEN configuracion:=NEW.configuracion_id;
        ELSE SELECT configuracion_id INTO configuracion FROM evaluaciones WHERE id=NEW.evaluacion_id;
        END IF;
        IF configuracion IS NULL THEN RETURN NULL; END IF;
        SELECT c.grupo_id,p.estructura INTO grupo,esperado FROM configuraciones_evaluacion_grupo c
          JOIN planes_evaluacion p ON p.id=c.plan_id WHERE c.id=configuracion;
        IF EXISTS(SELECT 1 FROM evaluaciones WHERE grupo_id=grupo AND (configuracion_id IS DISTINCT FROM configuracion OR NOT activo))
          OR EXISTS(SELECT 1 FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id
            WHERE e.configuracion_id=configuracion AND (i.grupo_id<>grupo OR NOT i.activo)) THEN
          RAISE EXCEPTION 'El snapshot debe conservar exclusivamente criterios activos del plan' USING ERRCODE='23514';
        END IF;
        SELECT jsonb_build_object('evaluaciones',COALESCE(jsonb_agg(jsonb_build_object(
          'nombre',e.nombre,'unidadId',e.unidad_id::text,'pesoPct',e.peso_pct::text,'orden',e.orden,
          'indicadores',(SELECT COALESCE(jsonb_agg(jsonb_build_object('codigo',i.codigo,'descripcion',i.descripcion,
            'pesoPct',i.peso_pct::text,'orden',i.orden) ORDER BY i.orden),'[]'::jsonb)
            FROM indicadores_evaluacion i WHERE i.evaluacion_id=e.id)
          ) ORDER BY e.orden),'[]'::jsonb)) INTO real FROM evaluaciones e WHERE e.configuracion_id=configuracion;
        IF real IS DISTINCT FROM esperado THEN
          RAISE EXCEPTION 'El snapshot de evaluación debe coincidir completamente con el plan aprobado' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER configuraciones_evaluacion_snapshot AFTER INSERT ON configuraciones_evaluacion_grupo
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_snapshot_evaluacion();
      CREATE CONSTRAINT TRIGGER evaluaciones_snapshot AFTER INSERT ON evaluaciones
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_snapshot_evaluacion();
      CREATE CONSTRAINT TRIGGER indicadores_snapshot AFTER INSERT ON indicadores_evaluacion
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_snapshot_evaluacion();

      CREATE FUNCTION conservar_snapshot_truncado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS(SELECT 1 FROM configuraciones_evaluacion_grupo) THEN
          RAISE EXCEPTION 'Los snapshots de evaluación no se eliminan físicamente' USING ERRCODE='23001';
        END IF;
        RETURN NULL;
      END $$;
      CREATE TRIGGER evaluaciones_snapshot_truncate BEFORE TRUNCATE ON evaluaciones
        FOR EACH STATEMENT EXECUTE FUNCTION conservar_snapshot_truncado();
      CREATE TRIGGER indicadores_snapshot_truncate BEFORE TRUNCATE ON indicadores_evaluacion
        FOR EACH STATEMENT EXECUTE FUNCTION conservar_snapshot_truncado();

      CREATE FUNCTION conservar_unidad_de_plan() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' OR NEW.nivel_id<>OLD.nivel_id THEN
          IF EXISTS(SELECT 1 FROM planes_evaluacion p CROSS JOIN LATERAL jsonb_array_elements(p.estructura->'evaluaciones') e
            WHERE e->>'unidadId'=OLD.id::text) THEN
            RAISE EXCEPTION 'La unidad referenciada por un plan conserva su identidad y nivel' USING ERRCODE='23001';
          END IF;
        END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER unidades_planes_evaluacion BEFORE UPDATE OF nivel_id OR DELETE ON unidades_didacticas
        FOR EACH ROW EXECUTE FUNCTION conservar_unidad_de_plan();
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM planes_evaluacion) OR EXISTS(SELECT 1 FROM configuraciones_evaluacion_grupo) THEN
          RAISE EXCEPTION 'No se revierte B16 con planes o configuraciones persistidos' USING ERRCODE='23514';
        END IF;
      END $$;
      DROP TRIGGER unidades_planes_evaluacion ON unidades_didacticas;
      DROP FUNCTION conservar_unidad_de_plan();
      DROP TRIGGER indicadores_snapshot_truncate ON indicadores_evaluacion;
      DROP TRIGGER evaluaciones_snapshot_truncate ON evaluaciones;
      DROP FUNCTION conservar_snapshot_truncado();
      DROP TRIGGER indicadores_snapshot ON indicadores_evaluacion;
      DROP TRIGGER evaluaciones_snapshot ON evaluaciones;
      DROP TRIGGER configuraciones_evaluacion_snapshot ON configuraciones_evaluacion_grupo;
      DROP FUNCTION comprobar_snapshot_evaluacion();
      DROP TRIGGER indicadores_configurados ON indicadores_evaluacion;
      DROP FUNCTION proteger_indicadores_configurados();
      DROP TRIGGER evaluaciones_configuradas ON evaluaciones;
      DROP FUNCTION proteger_evaluaciones_configuradas();
      DROP TRIGGER configuraciones_evaluacion_aplicacion ON configuraciones_evaluacion_grupo;
      DROP FUNCTION aplicar_plan_evaluacion();
      DROP TRIGGER planes_evaluacion_validacion ON planes_evaluacion;
      DROP FUNCTION validar_plan_evaluacion();
      ALTER TABLE evaluaciones DROP COLUMN configuracion_id;
      DROP TABLE configuraciones_evaluacion_grupo;
      DROP TABLE planes_evaluacion;
      DROP FUNCTION normalizar_estructura_evaluacion(jsonb,bigint,boolean);
    `);
  }
}
