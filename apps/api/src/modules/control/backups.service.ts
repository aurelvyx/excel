import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Identity } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { page } from '../../common/validation.js';

export const backupTypes = ['RESPALDO', 'RESTAURACION'] as const;
export const backupStates = ['INICIADO', 'EXITOSO', 'FALLIDO'] as const;
const columns = `r.id,r.operacion_id,r.tipo,r.estado,r.ubicacion_logica,r.checksum,
  r.manifest_sha256,r.tamano_bytes::text,r.detalle,r.ejecutado_por,r.proceso_tecnico,
  r.iniciado_at,r.finalizado_at,r.respaldo_id,r.verificacion_completa,u.nombre_usuario`;

@Injectable()
export class BackupsService {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  async list(actor: Identity, query: Record<string, unknown>) {
    const { after, limit } = page(query, ['tipo', 'estado']);
    for (const [key, allowed] of [
      ['tipo', backupTypes],
      ['estado', backupStates],
    ] as const)
      if (
        query[key] !== undefined &&
        !(allowed as readonly unknown[]).includes(query[key])
      )
        throw new BadRequestException('Filtro de respaldo inválido');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const items = (await manager.query(
        `WITH actuales AS (SELECT DISTINCT ON(operacion_id) * FROM respaldos ORDER BY operacion_id,id DESC)
         SELECT ${columns} FROM actuales r LEFT JOIN usuarios u ON u.id=r.ejecutado_por
         WHERE r.id>$1::bigint AND ($2::text IS NULL OR r.tipo=$2) AND ($3::text IS NULL OR r.estado=$3)
         ORDER BY r.id LIMIT $4`,
        [after, query.tipo ?? null, query.estado ?? null, limit + 1],
      )) as { id: string }[];
      const [ultimoRespaldo] = await manager.query(
        `SELECT ${columns} FROM respaldos r LEFT JOIN usuarios u ON u.id=r.ejecutado_por
         WHERE r.tipo='RESPALDO' AND r.estado='EXITOSO' ORDER BY r.id DESC LIMIT 1`,
      );
      const [ultimaVerificacion] = await manager.query(
        `SELECT ${columns} FROM respaldos r LEFT JOIN usuarios u ON u.id=r.ejecutado_por
         WHERE r.tipo='RESTAURACION' AND r.estado='EXITOSO' AND r.verificacion_completa ORDER BY r.id DESC LIMIT 1`,
      );
      return {
        items: items.slice(0, limit),
        nextCursor: items.length > limit ? items[limit - 1]!.id : null,
        ultimoRespaldo: ultimoRespaldo ?? null,
        ultimaVerificacion: ultimaVerificacion ?? null,
      };
    });
  }
}
