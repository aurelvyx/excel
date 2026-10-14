import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { EvaluationDefinition } from './evaluation.policy.js';

export type EvaluationLevel = {
  id: string;
  nombre: string;
  idioma: string;
  activo: boolean;
  idioma_activo: boolean;
};
export type EvaluationPlan = Record<string, unknown> & {
  id: string;
  nivel_id: string;
  version: number;
  nombre: string;
  formula: 'PONDERADA_JERARQUICA_V1';
  estructura: EvaluationDefinition;
  estado: 'BORRADOR' | 'APROBADO';
  revision: number;
};
export type EvaluationConfiguration = Record<string, unknown> & {
  id: string;
  grupo_id: string;
  nivel_id: string;
  plan_id: string;
};

@Injectable()
export class EvaluationRepository {
  async level(
    manager: EntityManager,
    id: string,
    write = false,
  ): Promise<EvaluationLevel> {
    const [row] = await manager.query(
      `SELECT n.id,n.nombre,n.activo,i.nombre AS idioma,i.activo AS idioma_activo
      FROM niveles n JOIN idiomas i ON i.id=n.idioma_id WHERE n.id=$1::bigint
      FOR ${write ? 'UPDATE' : 'SHARE'} OF n FOR SHARE OF i`,
      [id],
    );
    if (!row) throw new NotFoundException('Nivel no encontrado');
    return row as EvaluationLevel;
  }
  async units(manager: EntityManager, levelId: string) {
    return manager.query(
      'SELECT id,nombre,orden,activo FROM unidades_didacticas WHERE nivel_id=$1::bigint ORDER BY orden,id',
      [levelId],
    );
  }
  async plan(
    manager: EntityManager,
    id: string,
    write = false,
  ): Promise<EvaluationPlan> {
    const [row] = await manager.query(
      `SELECT p.*,u.nombre_usuario AS creado_nombre,a.nombre_usuario AS aprobado_nombre
      FROM planes_evaluacion p JOIN usuarios u ON u.id=p.creado_por
      LEFT JOIN usuarios a ON a.id=p.aprobado_por WHERE p.id=$1::bigint
      FOR ${write ? 'UPDATE' : 'SHARE'} OF p`,
      [id],
    );
    if (!row)
      throw new NotFoundException('Versión de evaluación no encontrada');
    return row as EvaluationPlan;
  }
  async plans(
    manager: EntityManager,
    levelId: string,
    approvedOnly = false,
  ): Promise<EvaluationPlan[]> {
    return manager.query(
      `SELECT p.*,u.nombre_usuario AS creado_nombre,a.nombre_usuario AS aprobado_nombre
      FROM planes_evaluacion p JOIN usuarios u ON u.id=p.creado_por LEFT JOIN usuarios a ON a.id=p.aprobado_por
      WHERE p.nivel_id=$1::bigint ${approvedOnly ? "AND p.estado='APROBADO'" : ''} ORDER BY p.version DESC`,
      [levelId],
    );
  }
  async configuration(
    manager: EntityManager,
    groupId: string,
  ): Promise<EvaluationConfiguration | null> {
    const [row] = await manager.query(
      `SELECT c.*,u.nombre_usuario AS aplicado_nombre FROM configuraciones_evaluacion_grupo c
      JOIN usuarios u ON u.id=c.aplicado_por WHERE c.grupo_id=$1::bigint`,
      [groupId],
    );
    return (row as EvaluationConfiguration | undefined) ?? null;
  }
  async components(manager: EntityManager, configurationId: string) {
    const rows = (await manager.query(
      'SELECT id,nombre,peso_pct::text,orden,unidad_id FROM evaluaciones WHERE configuracion_id=$1::bigint ORDER BY orden,id',
      [configurationId],
    )) as (Record<string, unknown> & { id: string })[];
    const indicators = (await manager.query(
      `SELECT i.id,i.evaluacion_id,i.codigo,i.descripcion,i.peso_pct::text,i.orden FROM indicadores_evaluacion i
      JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.configuracion_id=$1::bigint ORDER BY i.orden,i.id`,
      [configurationId],
    )) as (Record<string, unknown> & { evaluacion_id: string })[];
    return rows.map((row) => ({
      ...row,
      indicadores: indicators
        .filter((i) => i.evaluacion_id === row.id)
        .map(({ evaluacion_id: _id, ...i }) => i),
    }));
  }
  async history(manager: EntityManager, planId: string) {
    return manager.query(
      `SELECT e.id,e.accion,e.usuario_id,u.nombre_usuario,e.ocurrido_at,e.motivo,e.valor_anterior,e.valor_nuevo
      FROM auditoria_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
      WHERE e.entidad='planes_evaluacion' AND e.entidad_id=$1::text ORDER BY e.id`,
      [planId],
    );
  }
}
