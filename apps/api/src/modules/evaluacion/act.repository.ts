import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AcademicCondition } from './result.policy.js';

export type StoredResult = {
  id: string;
  matricula_id: string;
  promedio: string | null;
  nota_oficial: number | null;
  tardanzas_total: number;
  faltas_equivalentes: string;
  inasistencia_pct: string | null;
  condicion: AcademicCondition | null;
  calculado_at: string;
  confirmado_at: string | null;
  cierre_id: string | null;
  configuracion_id: string | null;
  version: number;
  calculo: Record<string, unknown> | null;
};
export type ActClosure = Record<string, unknown> & {
  id: string;
  grupo_id: string;
  resumen: Record<string, unknown>;
};
export type ActRoster = {
  matricula_id: string;
  codigo_matricula: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  numero_intento: number;
  estado_matricula: string;
};

@Injectable()
export class ActRepository {
  async closure(
    manager: EntityManager,
    groupId: string,
  ): Promise<ActClosure | null> {
    const [row] = await manager.query(
      `SELECT c.*,u.nombre_usuario AS realizado_nombre FROM cierres_academicos c
      JOIN usuarios u ON u.id=c.realizado_por WHERE c.grupo_id=$1::bigint AND c.tipo='ACTA' AND c.estado='CERRADO' ORDER BY c.id DESC LIMIT 1`,
      [groupId],
    );
    return row ?? null;
  }
  async roster(manager: EntityManager, groupId: string): Promise<ActRoster[]> {
    return manager.query(
      `SELECT m.id AS matricula_id,m.codigo AS codigo_matricula,m.numero_intento,m.estado AS estado_matricula,
      concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento
      FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
      WHERE m.grupo_id=$1::bigint AND m.estado IN ('ACTIVA','CERRADA') ORDER BY m.id`,
      [groupId],
    );
  }
  async results(
    manager: EntityManager,
    ids: readonly string[],
    write = false,
  ): Promise<StoredResult[]> {
    if (!ids.length) return [];
    return manager.query(
      `SELECT * FROM resultados_academicos WHERE matricula_id=ANY($1::bigint[]) ORDER BY matricula_id ${write ? 'FOR UPDATE' : ''}`,
      [ids],
    );
  }
  async groupResults(
    manager: EntityManager,
    groupId: string,
  ): Promise<StoredResult[]> {
    return manager.query(
      `SELECT r.* FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id
      WHERE m.grupo_id=$1::bigint ORDER BY r.matricula_id`,
      [groupId],
    );
  }
  async result(manager: EntityManager, id: string): Promise<StoredResult> {
    const [row] = await manager.query(
      'SELECT * FROM resultados_academicos WHERE id=$1::bigint',
      [id],
    );
    return row as StoredResult;
  }
  async inputs(manager: EntityManager, groupId: string) {
    const grades = await manager.query(
      'SELECT id,matricula_id,indicador_id,nota::text,version FROM calificaciones WHERE grupo_id=$1::bigint ORDER BY id',
      [groupId],
    );
    const attendance = await manager.query(
      `SELECT s.id,s.fecha::text,s.estado,a.id AS asistencia_id,a.matricula_id,a.codigo,a.version,
      j.id AS justificacion_id,j.estado AS justificacion_estado,j.version AS justificacion_version
      FROM sesiones_clase s LEFT JOIN asistencias a ON a.sesion_id=s.id LEFT JOIN justificaciones j ON j.asistencia_id=a.id
      WHERE s.grupo_id=$1::bigint ORDER BY s.id,a.id`,
      [groupId],
    );
    return { grades, attendance };
  }
  async gradeDetails(
    manager: EntityManager,
    groupId: string,
    enrollmentId: string,
  ) {
    return manager.query(
      `SELECT c.id,c.matricula_id,c.indicador_id,c.grupo_id,to_char(c.nota,'FM990.00') AS nota,c.version,c.registrado_por,c.registrado_at,c.actualizado_at,
      e.nombre AS evaluacion,concat_ws(' — ',i.codigo,i.descripcion) AS indicador FROM calificaciones c
      JOIN indicadores_evaluacion i ON i.id=c.indicador_id JOIN evaluaciones e ON e.id=i.evaluacion_id
      WHERE c.grupo_id=$1::bigint AND c.matricula_id=$2::bigint ORDER BY e.orden,i.orden`,
      [groupId, enrollmentId],
    );
  }
  async sessions(
    manager: EntityManager,
    groupId: string,
    enrollmentId: string,
    cutoff: string | null,
  ) {
    return manager.query(
      `SELECT s.id,s.fecha::text,s.estado,(s.estado='REALIZADA' AND s.fecha<=$3::date) AS computable,
      CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id::text,'codigo',a.codigo,'observacion',a.observacion,'version',a.version) END AS asistencia,
      j.id AS "justificacionId",j.estado AS "justificacionEstado"
      FROM sesiones_clase s LEFT JOIN asistencias a ON a.sesion_id=s.id AND a.matricula_id=$2::bigint
      LEFT JOIN justificaciones j ON j.asistencia_id=a.id WHERE s.grupo_id=$1::bigint ORDER BY s.fecha,s.id`,
      [groupId, enrollmentId, cutoff],
    );
  }
  async history(
    manager: EntityManager,
    groupId: string,
    enrollmentId?: string,
  ) {
    return manager.query(
      `SELECT a.id,a.accion,a.usuario_id,u.nombre_usuario,a.ocurrido_at,a.motivo,a.entidad_id,a.valor_anterior,a.valor_nuevo
      FROM auditoria_eventos a JOIN resultados_academicos r ON r.id::text=a.entidad_id JOIN matriculas m ON m.id=r.matricula_id
      LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.entidad='resultados_academicos' AND m.grupo_id=$1::bigint
      AND ($2::bigint IS NULL OR m.id=$2::bigint) ORDER BY a.id`,
      [groupId, enrollmentId ?? null],
    );
  }
}
