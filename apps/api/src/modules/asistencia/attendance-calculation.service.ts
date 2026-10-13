import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { academicDateSql } from './academic-context.js';
import {
  calculateAttendance,
  type AttendanceRules,
  type AttendanceTotals,
  type AttendanceSummary,
} from './attendance-calculation.policy.js';

const computableSession = `s.estado='REALIZADA' AND s.fecha<=${academicDateSql}`;
type CountsRow = AttendanceTotals &
  AttendanceRules & {
    matriculaId: string;
    estadoMatricula: string;
  };

/** Proyección de datos persistidos; el llamador ya autorizó el alcance dentro de su transacción. */
@Injectable()
export class AttendanceCalculationService {
  async summaries(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, AttendanceSummary>> {
    if (!ids.length) return new Map();
    const rows = (await manager.query(
      `SELECT m.id AS "matriculaId",m.estado AS "estadoMatricula",p.id AS "parametroId",
      p.version,p.inasistencia_max_pct::text AS "inasistenciaMaxPct",p.tardanzas_por_falta AS "tardanzasPorFalta",
      count(s.id)::int AS "sesionesComputables",
      count(s.id) FILTER(WHERE a.codigo='P')::int AS presentes,
      count(s.id) FILTER(WHERE a.codigo='F')::int AS faltas,
      count(s.id) FILTER(WHERE a.codigo='T')::int AS tardanzas,
      count(s.id) FILTER(WHERE a.id IS NULL)::int AS "marcasPendientes",
      count(s.id) FILTER(WHERE a.codigo='J' AND (j.id IS NULL OR j.estado IN ('PENDIENTE','APROBADA')))::int AS "justificadasPendientes",
      count(s.id) FILTER(WHERE a.codigo='J' AND j.estado='RECUPERADA')::int AS "justificadasRecuperadas",
      count(s.id) FILTER(WHERE a.codigo='J' AND j.estado='RECHAZADA')::int AS "justificadasRechazadas",
      count(s.id) FILTER(WHERE a.codigo='J' AND j.estado='NO_RECUPERADA')::int AS "justificadasNoRecuperadas"
      FROM matriculas m JOIN parametros_academicos p ON p.id=m.parametro_id
      LEFT JOIN sesiones_clase s ON s.grupo_id=m.grupo_id AND ${computableSession}
      LEFT JOIN asistencias a ON a.sesion_id=s.id AND a.matricula_id=m.id
      LEFT JOIN justificaciones j ON j.asistencia_id=a.id
      WHERE m.id=ANY($1::bigint[]) GROUP BY m.id,p.id ORDER BY m.id`,
      [ids],
    )) as CountsRow[];
    // B15 aportará el cierre específico confirmado; un grupo CERRADO no lo sustituye.
    return new Map(
      rows.map((row) => [
        row.matriculaId,
        calculateAttendance(
          {
            sesionesComputables: row.sesionesComputables,
            presentes: row.presentes,
            faltas: row.faltas,
            tardanzas: row.tardanzas,
            marcasPendientes: row.marcasPendientes,
            justificadasPendientes: row.justificadasPendientes,
            justificadasRecuperadas: row.justificadasRecuperadas,
            justificadasRechazadas: row.justificadasRechazadas,
            justificadasNoRecuperadas: row.justificadasNoRecuperadas,
          },
          {
            parametroId: row.parametroId,
            version: row.version,
            inasistenciaMaxPct: row.inasistenciaMaxPct,
            tardanzasPorFalta: row.tardanzasPorFalta,
          },
          row.estadoMatricula,
        ),
      ]),
    );
  }

  async details(manager: EntityManager, attemptId: string) {
    return manager.query(
      `SELECT s.id,s.fecha::text AS fecha,s.estado,a.codigo,(${computableSession}) AS computable,
      j.id AS "justificacionId",j.estado AS "justificacionEstado"
      FROM matriculas m JOIN sesiones_clase s ON s.grupo_id=m.grupo_id
      LEFT JOIN asistencias a ON a.sesion_id=s.id AND a.matricula_id=m.id
      LEFT JOIN justificaciones j ON j.asistencia_id=a.id
      WHERE m.id=$1::bigint ORDER BY s.fecha,s.id`,
      [attemptId],
    );
  }
}
