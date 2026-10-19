import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { EvaluationDefinition } from './evaluation.policy.js';
import { calculateGradeAverage } from './grade.policy.js';

export type GradeSummary = {
  configuracionAprobada: boolean;
  promedio: string | null;
  notaOficial: number | null;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
  motivoPendiente: string | null;
};

/** Proyección oficial del cálculo, sin asignar condición ni modificar resultados históricos. */
@Injectable()
export class GradeCalculationService {
  async summaries(
    manager: EntityManager,
    enrollmentIds: readonly string[],
  ): Promise<Map<string, GradeSummary>> {
    const summaries = new Map<string, GradeSummary>();
    if (!enrollmentIds.length) return summaries;
    const rows = (await manager.query(
      `SELECT m.id,p.formula,p.estructura,p.estado FROM matriculas m
      LEFT JOIN configuraciones_evaluacion_grupo cfg ON cfg.grupo_id=m.grupo_id
      LEFT JOIN planes_evaluacion p ON p.id=cfg.plan_id WHERE m.id=ANY($1::bigint[])`,
      [enrollmentIds],
    )) as {
      id: string;
      formula: string | null;
      estructura: EvaluationDefinition | null;
      estado: string | null;
    }[];
    const notes = (await manager.query(
      `SELECT c.matricula_id,e.orden AS evaluacion_orden,i.orden AS indicador_orden,c.nota::text AS nota
      FROM calificaciones c JOIN matriculas m ON m.id=c.matricula_id
      JOIN configuraciones_evaluacion_grupo cfg ON cfg.grupo_id=m.grupo_id
      JOIN indicadores_evaluacion i ON i.id=c.indicador_id JOIN evaluaciones e ON e.id=i.evaluacion_id
      WHERE c.matricula_id=ANY($1::bigint[]) AND e.configuracion_id=cfg.id AND e.activo AND i.activo`,
      [enrollmentIds],
    )) as {
      matricula_id: string;
      evaluacion_orden: number;
      indicador_orden: number;
      nota: string;
    }[];
    const byEnrollment = new Map<
      string,
      { evaluacionOrden: number; indicadorOrden: number; nota: string }[]
    >();
    for (const note of notes) {
      const list = byEnrollment.get(note.matricula_id) ?? [];
      list.push({
        evaluacionOrden: note.evaluacion_orden,
        indicadorOrden: note.indicador_orden,
        nota: note.nota,
      });
      byEnrollment.set(note.matricula_id, list);
    }
    for (const row of rows) {
      if (!row.estructura || !row.formula || row.estado !== 'APROBADO') {
        summaries.set(row.id, {
          configuracionAprobada: false,
          promedio: null,
          notaOficial: null,
          calificacionesEsperadas: 0,
          calificacionesRegistradas: 0,
          calificacionesPendientes: 0,
          motivoPendiente: 'No hay criterios aprobados aplicados al grupo',
        });
        continue;
      }
      const result = calculateGradeAverage(
        row.formula,
        row.estructura,
        byEnrollment.get(row.id) ?? [],
      );
      summaries.set(row.id, {
        configuracionAprobada: true,
        ...result,
        motivoPendiente: result.calificacionesPendientes
          ? 'Hay calificaciones pendientes de registro'
          : null,
      });
    }
    return summaries;
  }
}
