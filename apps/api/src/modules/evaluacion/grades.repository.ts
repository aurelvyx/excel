import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export type Grade = {
  id: string;
  matricula_id: string;
  indicador_id: string;
  grupo_id: string;
  nota: string;
  version: number;
  registrado_por: string;
  registrado_at: string;
  actualizado_at: string | null;
};
export type GradeRoster = {
  matricula_id: string;
  codigo_matricula: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  numero_intento: number;
  estado_matricula: string;
  editable: boolean;
};
export const gradeColumns =
  "id,matricula_id,indicador_id,grupo_id,to_char(nota,'FM990.00') AS nota,version,registrado_por,registrado_at,actualizado_at";

@Injectable()
export class GradesRepository {
  async act(manager: EntityManager, groupId: string) {
    const [row] = await manager.query(
      "SELECT c.id,c.grupo_id,c.tipo,c.estado,c.realizado_por,c.realizado_at,c.motivo,u.nombre_usuario AS realizado_nombre FROM cierres_academicos c JOIN usuarios u ON u.id=c.realizado_por WHERE c.grupo_id=$1::bigint AND c.tipo='ACTA' AND c.estado='CERRADO' ORDER BY c.id DESC LIMIT 1",
      [groupId],
    );
    return { cerrada: !!row, cierre: row ?? null };
  }
  async roster(
    manager: EntityManager,
    groupId: string,
    after: string,
    limit: number,
    editable: boolean,
  ): Promise<GradeRoster[]> {
    return manager.query(
      `SELECT m.id AS matricula_id,m.codigo AS codigo_matricula,m.numero_intento,m.estado AS estado_matricula,
      concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento,
      ($4::boolean AND m.estado='ACTIVA' AND NOT EXISTS(SELECT 1 FROM resultados_academicos r WHERE r.matricula_id=m.id)) AS editable
      FROM matriculas m JOIN estudiantes s ON s.id=m.estudiante_id JOIN personas p ON p.id=s.persona_id
      WHERE m.grupo_id=$1::bigint AND m.id>$2::bigint AND (m.estado IN ('ACTIVA','CERRADA') OR EXISTS(SELECT 1 FROM calificaciones c WHERE c.matricula_id=m.id))
      ORDER BY m.id LIMIT $3`,
      [groupId, after, limit, editable],
    );
  }
  async grades(
    manager: EntityManager,
    groupId: string,
    enrollmentIds: string[],
    write = false,
  ): Promise<Grade[]> {
    if (!enrollmentIds.length) return [];
    return manager.query(
      `SELECT ${gradeColumns} FROM calificaciones WHERE grupo_id=$1::bigint AND matricula_id=ANY($2::bigint[]) ORDER BY matricula_id,indicador_id ${write ? 'FOR UPDATE' : ''}`,
      [groupId, enrollmentIds],
    );
  }
  async grade(manager: EntityManager, id: string): Promise<Grade> {
    const [row] = await manager.query(
      `SELECT ${gradeColumns} FROM calificaciones WHERE id=$1::bigint`,
      [id],
    );
    if (!row) throw new NotFoundException('Calificación no encontrada');
    return row as Grade;
  }
  async enrollments(manager: EntityManager, groupId: string, ids: string[]) {
    return manager.query(
      `SELECT m.id,m.estado,EXISTS(SELECT 1 FROM resultados_academicos r WHERE r.matricula_id=m.id) AS tiene_resultado
      FROM matriculas m WHERE m.grupo_id=$1::bigint AND m.id=ANY($2::bigint[]) ORDER BY m.id FOR SHARE OF m`,
      [groupId, ids],
    ) as Promise<{ id: string; estado: string; tiene_resultado: boolean }[]>;
  }
  async indicators(
    manager: EntityManager,
    groupId: string,
    configurationId: string,
    ids: string[],
  ) {
    return manager.query(
      `SELECT i.id FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id
      WHERE i.grupo_id=$1::bigint AND e.configuracion_id=$2::bigint AND i.id=ANY($3::bigint[]) AND i.activo AND e.activo ORDER BY i.id FOR SHARE OF i,e`,
      [groupId, configurationId, ids],
    ) as Promise<{ id: string }[]>;
  }
  async history(manager: EntityManager, gradeId: string) {
    return manager.query(
      `SELECT a.id,a.accion,a.usuario_id,u.nombre_usuario,a.ocurrido_at,a.motivo,
      CASE WHEN a.valor_anterior IS NULL THEN NULL ELSE jsonb_build_object('nota',a.valor_anterior->>'nota','version',a.valor_anterior->'version') END AS valor_anterior,
      jsonb_build_object('nota',a.valor_nuevo->>'nota','version',a.valor_nuevo->'version') AS valor_nuevo
      FROM auditoria_eventos a LEFT JOIN usuarios u ON u.id=a.usuario_id
      WHERE a.entidad='calificaciones' AND a.entidad_id=$1::text ORDER BY a.id`,
      [gradeId],
    );
  }
}
