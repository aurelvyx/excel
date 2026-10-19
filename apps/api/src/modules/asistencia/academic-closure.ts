import type { EntityManager } from 'typeorm';
import { academicDateSql } from './academic-date.js';

export type AcademicClosure = {
  id: string;
  grupo_id: string;
  tipo: 'ASISTENCIA';
  estado: 'CERRADO';
  motivo: string | null;
  realizado_por: string;
  realizado_at: string;
  realizado_nombre: string;
  fecha_corte: string;
  revision: string;
  resumen: Record<string, unknown>;
};

export const attendanceClosureJoin =
  "LEFT JOIN cierres_academicos c ON c.grupo_id=m.grupo_id AND c.tipo='ASISTENCIA' AND c.estado='CERRADO'";
export const attendanceCutoffSql = `COALESCE((c.realizado_at AT TIME ZONE 'America/Lima')::date,${academicDateSql})`;
export const computableAttendanceSession = `s.estado='REALIZADA' AND s.fecha<=${attendanceCutoffSql}`;

/** El cierre de asistencia es un evento propio; no se deduce del estado del grupo. */
export async function loadAttendanceClosure(
  manager: EntityManager,
  groupId: string,
): Promise<AcademicClosure | null> {
  const [row] = await manager.query(
    `SELECT c.*,u.nombre_usuario AS realizado_nombre,
    (c.realizado_at AT TIME ZONE 'America/Lima')::date::text AS fecha_corte
    FROM cierres_academicos c JOIN usuarios u ON u.id=c.realizado_por
    WHERE c.grupo_id=$1::bigint AND c.tipo='ASISTENCIA' AND c.estado='CERRADO' ORDER BY c.id DESC LIMIT 1`,
    [groupId],
  );
  return (row as AcademicClosure | undefined) ?? null;
}
