import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { groupContext } from '../oferta-academica/group-context.js';

export type ClassSession = Record<string, unknown> & {
  id: string;
  grupo_id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA';
  creado_por: string;
};
export type AcademicGroup = Record<string, unknown> & {
  id: string;
  codigo: string;
  estado: string;
  periodo_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_estado: string;
  asistencia_cerrada: boolean;
};
export const sessionColumns =
  'id,grupo_id,fecha::text,hora_inicio::text,hora_fin::text,estado,creado_por';

/** Contexto académico consistente para programación y registro, sin ampliar el alcance del actor. */
export async function loadAcademicGroup(
  manager: EntityManager,
  id: string,
): Promise<AcademicGroup> {
  const [group] = (await manager.query(
    `SELECT t.id,t.codigo,t.estado,t.periodo_id,p.fecha_inicio::text,p.fecha_fin::text,
    p.estado AS periodo_estado,(t.estado='CERRADO') AS asistencia_cerrada,${groupContext}
    FROM grupos t JOIN periodos_academicos p ON p.id=t.periodo_id WHERE t.id=$1::bigint FOR SHARE OF t,p`,
    [id],
  )) as AcademicGroup[];
  if (!group) throw new NotFoundException('Grupo no encontrado');
  return group;
}
export async function loadClassSession(
  manager: EntityManager,
  groupId: string,
  sessionId: string,
  write = false,
): Promise<ClassSession> {
  const [session] = (await manager.query(
    `SELECT ${sessionColumns} FROM sesiones_clase WHERE grupo_id=$1::bigint AND id=$2::bigint FOR ${write ? 'UPDATE' : 'SHARE'}`,
    [groupId, sessionId],
  )) as ClassSession[];
  if (!session)
    throw new NotFoundException('Sesión no encontrada para este grupo');
  return session;
}
export async function academicDate(manager: EntityManager): Promise<string> {
  const [row] = await manager.query(
    "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS fecha",
  );
  return row.fecha as string;
}
