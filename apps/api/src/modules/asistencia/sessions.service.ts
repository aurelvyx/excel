import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { Identity } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { AuditService } from '../control/audit.service.js';
import {
  assignedToGroup,
  requireGroupRead,
} from '../oferta-academica/group-scope.js';
import { readers } from '../oferta-academica/catalogs.js';
import { groupContext } from '../oferta-academica/group-context.js';
import { page, validId } from '../../common/validation.js';
import { validateSessionSchedule } from './session.policy.js';
import type { ScheduleSessionsDto } from './sessions.dto.js';

type Session = Record<string, unknown> & {
  id: string;
  grupo_id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA';
  creado_por: string;
};
type Group = Record<string, unknown> & {
  id: string;
  codigo: string;
  estado: string;
  periodo_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_estado: string;
  asistencia_cerrada: boolean;
};
const columns =
  'id,grupo_id,fecha::text,hora_inicio::text,hora_fin::text,estado,creado_por';
export const sessionReaders = [...readers, 'DOCENTE'] as const;

@Injectable()
export class SessionsService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async group(manager: EntityManager, id: string): Promise<Group> {
    const [group] = (await manager.query(
      `SELECT t.id,t.codigo,t.estado,t.periodo_id,p.fecha_inicio::text,p.fecha_fin::text,
      p.estado AS periodo_estado,(t.estado='CERRADO') AS asistencia_cerrada,${groupContext}
      FROM grupos t JOIN periodos_academicos p ON p.id=t.periodo_id WHERE t.id=$1::bigint FOR SHARE OF t,p`,
      [id],
    )) as Group[];
    if (!group) throw new NotFoundException('Grupo no encontrado');
    return group;
  }

  async list(actor: Identity, groupId: string, query: Record<string, unknown>) {
    validId(groupId);
    const { after, limit } = page(query);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await this.group(manager, groupId);
      const assigned =
        roles.includes('DOCENTE') &&
        (await assignedToGroup(manager, actor, groupId));
      const items = (await manager.query(
        `SELECT ${columns} FROM sesiones_clase WHERE grupo_id=$1::bigint AND id>$2::bigint ORDER BY id LIMIT $3`,
        [groupId, after, limit],
      )) as Session[];
      return {
        items,
        nextCursor: items.length === limit ? items.at(-1)!.id : null,
        grupo: group,
        puedeProgramar:
          (roles.includes('ADMIN') || assigned) &&
          group.estado !== 'CERRADO' &&
          group.periodo_estado !== 'CERRADO',
      };
    });
  }

  async schedule(
    actor: Identity,
    groupId: string,
    dto: ScheduleSessionsDto,
    ip?: string,
  ) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN', 'DOCENTE']);
      if (
        !roles.includes('ADMIN') &&
        !(await assignedToGroup(manager, actor, groupId))
      )
        throw new ForbiddenException('Grupo no asignado');
      const group = await this.group(manager, groupId);
      if (group.estado === 'CERRADO' || group.periodo_estado === 'CERRADO')
        throw new ConflictException(
          'El grupo o periodo está cerrado; no admite programación',
        );
      try {
        validateSessionSchedule(dto, group);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      // Sin ON CONFLICT silencioso: cualquier duplicado revierte el lote completo.
      const dates = [...dto.fechas].sort();
      const [duplicate] = await manager.query(
        'SELECT id FROM sesiones_clase WHERE grupo_id=$1::bigint AND fecha=ANY($2::date[]) LIMIT 1',
        [groupId, dates],
      );
      if (duplicate)
        throw new ConflictException(
          'Ya existe una sesión para alguna de las fechas indicadas',
        );
      const items = (await manager.query(
        `INSERT INTO sesiones_clase (grupo_id,fecha,hora_inicio,hora_fin,estado,creado_por)
        SELECT $1::bigint,fecha,$3::time,$4::time,'PROGRAMADA',$5::bigint
        FROM unnest($2::date[]) AS fechas(fecha) ORDER BY fecha RETURNING ${columns}`,
        [groupId, dates, dto.horaInicio ?? null, dto.horaFin ?? null, actor.id],
      )) as Session[];
      for (const session of items)
        await this.audit.record(
          {
            usuarioId: actor.id,
            accion: 'CREATE',
            entidad: 'sesiones_clase',
            entidadId: session.id,
            nuevo: session,
            ip,
          },
          manager,
        );
      return { items };
    });
  }
}
