import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  ActClosure,
  ActRoster,
  StoredResult,
} from '../evaluacion/act.repository.js';
import type {
  EvaluationConfiguration,
  EvaluationPlan,
} from '../evaluacion/evaluation.repository.js';
import type { ReportType } from './reports.dto.js';
import type { ReportIndicator } from './report.model.js';

type Context = {
  idiomaId: string;
  idiomaCodigo: string;
  idioma: string;
  nivelId: string;
  nivel: string;
};
type Unit = {
  id: string;
  codigo: string;
  nombre: string;
  creditos: string | null;
  horas_teoricas: number;
  horas_practicas: number;
  orden: number;
  activo: boolean;
};

@Injectable()
export class ReportsRepository {
  async context(manager: EntityManager, groupId: string): Promise<Context> {
    // UPDATE de nivel también impide nuevas unidades referenciadas mientras se genera el archivo.
    const [row] = await manager.query(
      `SELECT i.id::text AS "idiomaId",i.codigo AS "idiomaCodigo",i.nombre AS idioma,
      n.id AS "nivelId",n.nombre AS nivel FROM grupos g JOIN niveles n ON n.id=g.nivel_id
      JOIN idiomas i ON i.id=n.idioma_id JOIN turnos t ON t.id=g.turno_id JOIN secciones s ON s.id=g.seccion_id
      WHERE g.id=$1::bigint FOR UPDATE OF n FOR SHARE OF i,t,s`,
      [groupId],
    );
    return row as Context;
  }
  async units(manager: EntityManager, levelId: string): Promise<Unit[]> {
    return manager.query(
      'SELECT id,codigo,nombre,creditos::text,horas_teoricas,horas_practicas,orden,activo FROM unidades_didacticas WHERE nivel_id=$1::bigint ORDER BY orden,id FOR SHARE',
      [levelId],
    );
  }
  async roster(manager: EntityManager, groupId: string): Promise<ActRoster[]> {
    return manager.query(
      `SELECT m.id AS matricula_id,m.codigo AS codigo_matricula,m.numero_intento,m.estado AS estado_matricula,
      concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento
      FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
      WHERE m.grupo_id=$1::bigint AND m.estado IN ('ACTIVA','CERRADA') ORDER BY m.id LIMIT 5001 FOR SHARE OF m,e,p`,
      [groupId],
    );
  }
  async configuration(
    manager: EntityManager,
    groupId: string,
  ): Promise<EvaluationConfiguration | null> {
    const [row] = await manager.query(
      'SELECT * FROM configuraciones_evaluacion_grupo WHERE grupo_id=$1::bigint FOR SHARE',
      [groupId],
    );
    return row ?? null;
  }
  async plan(manager: EntityManager, planId: string): Promise<EvaluationPlan> {
    const [row] = await manager.query(
      'SELECT * FROM planes_evaluacion WHERE id=$1::bigint FOR SHARE',
      [planId],
    );
    return row as EvaluationPlan;
  }
  async indicators(
    manager: EntityManager,
    configurationId: string,
  ): Promise<ReportIndicator[]> {
    return manager.query(
      `SELECT i.id,e.nombre AS evaluacion,i.codigo,i.descripcion,e.peso_pct::text AS "pesoEvaluacion",i.peso_pct::text AS "pesoIndicador"
      FROM evaluaciones e JOIN indicadores_evaluacion i ON i.evaluacion_id=e.id
      WHERE e.configuracion_id=$1::bigint AND e.activo AND i.activo ORDER BY e.orden,e.id,i.orden,i.id LIMIT 101 FOR SHARE OF e,i`,
      [configurationId],
    );
  }
  async closure(
    manager: EntityManager,
    groupId: string,
  ): Promise<ActClosure | null> {
    const [row] = await manager.query(
      "SELECT * FROM cierres_academicos WHERE grupo_id=$1::bigint AND tipo='ACTA' AND estado='CERRADO' ORDER BY id DESC LIMIT 1 FOR SHARE",
      [groupId],
    );
    return row ?? null;
  }
  async results(
    manager: EntityManager,
    ids: string[],
  ): Promise<StoredResult[]> {
    if (!ids.length) return [];
    return manager.query(
      'SELECT * FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[]) ORDER BY matricula_id FOR SHARE',
      [ids],
    );
  }
  async grades(manager: EntityManager, ids: string[]) {
    if (!ids.length) return [];
    return manager.query(
      'SELECT id,matricula_id,indicador_id,nota::text,version FROM calificaciones WHERE matricula_id=ANY($1::bigint[]) ORDER BY id FOR SHARE',
      [ids],
    ) as Promise<
      {
        id: string;
        matricula_id: string;
        indicador_id: string;
        nota: string;
        version: number;
      }[]
    >;
  }
  async inputs(manager: EntityManager, groupId: string) {
    const attempts = await manager.query(
      `SELECT m.*,p.version AS reglas_version,p.nota_minima::text,p.inasistencia_max_pct::text,p.tardanzas_por_falta
      FROM matriculas m JOIN parametros_academicos p ON p.id=m.parametro_id WHERE m.grupo_id=$1::bigint ORDER BY m.id FOR SHARE OF m,p`,
      [groupId],
    );
    const attendance = await manager.query(
      `SELECT s.id,s.fecha::text,s.estado,a.id AS asistencia_id,a.matricula_id,a.codigo,a.version,
      j.id AS justificacion_id,j.estado AS justificacion_estado,j.version AS justificacion_version
      FROM sesiones_clase s LEFT JOIN asistencias a ON a.sesion_id=s.id LEFT JOIN justificaciones j ON j.asistencia_id=a.id
      WHERE s.grupo_id=$1::bigint ORDER BY s.id,a.id`,
      [groupId],
    );
    const components = await manager.query(
      `SELECT e.*,i.id AS indicador_id,i.codigo,i.descripcion,i.peso_pct::text AS indicador_peso,i.orden AS indicador_orden,i.activo AS indicador_activo
      FROM evaluaciones e LEFT JOIN indicadores_evaluacion i ON i.evaluacion_id=e.id WHERE e.grupo_id=$1::bigint ORDER BY e.id,i.id`,
      [groupId],
    );
    return { attempts, attendance, components };
  }
  async history(
    manager: EntityManager,
    groupId: string,
    after: string,
    limit: number,
    matrixOnly: boolean,
  ) {
    return manager.query(
      `SELECT e.*,u.nombre_usuario FROM exportaciones e JOIN usuarios u ON u.id=e.usuario_id
      WHERE e.grupo_id=$1::bigint AND e.id>$2::bigint AND ($4::boolean=false OR e.tipo='MATRIZ_NOTAS') ORDER BY e.id LIMIT $3`,
      [groupId, after, limit + 1, matrixOnly],
    );
  }
  async insert(
    manager: EntityManager,
    values: {
      usuarioId: string;
      tipo: ReportType;
      grupoId: string;
      filtros: Record<string, string>;
      plantillaId: string;
      plantillaVersion: number;
      plantillaSha256: string;
      revision: string;
      archivoNombre: string;
      archivoSha256: string;
      filas: number;
    },
  ) {
    const [row] = await manager.query(
      `INSERT INTO exportaciones(usuario_id,tipo,grupo_id,filtros,plantilla_id,plantilla_version,plantilla_sha256,revision,archivo_nombre,archivo_sha256,filas)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        values.usuarioId,
        values.tipo,
        values.grupoId,
        values.filtros,
        values.plantillaId,
        values.plantillaVersion,
        values.plantillaSha256,
        values.revision,
        values.archivoNombre,
        values.archivoSha256,
        values.filas,
      ],
    );
    return row as Record<string, unknown> & { id: string };
  }
}
