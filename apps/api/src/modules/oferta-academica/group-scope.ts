import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Identity, Role } from '../auth/access.js';
import { readers } from './catalogs.js';

/** Se reutiliza en consultas de oferta y operaciones académicas del docente. */
export function assignedGroupSql(group: string, user: string): string {
  return `EXISTS (SELECT 1 FROM grupo_docentes gd JOIN docentes d ON d.id=gd.docente_id
    JOIN personas p ON p.id=d.persona_id JOIN usuarios u ON u.persona_id=p.id
    WHERE gd.grupo_id=${group} AND u.id=${user} AND gd.activo AND d.activo AND p.activo)`;
}

export async function assignedToGroup(
  manager: EntityManager,
  actor: Identity,
  groupId: string,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT gd.grupo_id FROM grupo_docentes gd JOIN docentes d ON d.id=gd.docente_id
    JOIN personas p ON p.id=d.persona_id JOIN usuarios u ON u.persona_id=p.id
    WHERE gd.grupo_id=$1::bigint AND u.id=$2 AND gd.activo AND d.activo AND p.activo
    FOR SHARE OF gd,d,p`,
    [groupId, actor.id],
  );
  return rows.length > 0;
}

export async function requireGroupRead(
  manager: EntityManager,
  actor: Identity,
  roles: readonly Role[],
  groupId: string,
): Promise<void> {
  if (readers.some((role) => roles.includes(role))) return;
  if (!(await assignedToGroup(manager, actor, groupId)))
    throw new ForbiddenException('Grupo no asignado');
}
