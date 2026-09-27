import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Identity, Role } from './access.js';

// Revalida dentro de la transacción y comparte el bloqueo de administración de B03.
export async function authorize(
  manager: EntityManager,
  actor: Identity,
  allowed: readonly Role[],
): Promise<Role[]> {
  await manager.query('SELECT pg_advisory_xact_lock(20260924,4)');
  const rows = (await manager.query(
    `SELECT r.codigo FROM usuarios u JOIN sesiones_usuario s ON s.usuario_id=u.id
    JOIN usuario_roles ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id
    WHERE u.id=$1 AND s.id=$2 AND u.activo AND NOT u.requiere_cambio_clave AND r.activo
      AND s.revocado_at IS NULL AND s.expira_at>CURRENT_TIMESTAMP FOR SHARE OF u,s`,
    [actor.id, actor.sessionId],
  )) as { codigo: Role }[];
  const roles = rows.map((row) => row.codigo);
  if (!allowed.some((role) => roles.includes(role)))
    throw new ForbiddenException('Acceso denegado');
  return roles;
}
