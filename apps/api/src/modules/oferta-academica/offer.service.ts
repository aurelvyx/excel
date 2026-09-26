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
import { page, validId } from '../../common/validation.js';
import { type CatalogKey, readers } from './catalogs.js';
import { OfferRepository, type Row } from './offer.repository.js';
import type { AssignmentDto } from './offer.dto.js';

@Injectable()
export class OfferService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(OfferRepository) private readonly repo: OfferRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async groupScope(
    manager: EntityManager,
    actor: Identity,
    roles: string[],
    groupId: string,
  ): Promise<void> {
    if (readers.some((role) => roles.includes(role))) return;
    const found: unknown[] = await manager.query(
      `SELECT gd.grupo_id FROM grupo_docentes gd
      JOIN docentes d ON d.id=gd.docente_id JOIN personas p ON p.id=d.persona_id JOIN usuarios u ON u.persona_id=p.id
      WHERE gd.grupo_id=$1::bigint AND u.id=$2 AND d.activo AND p.activo AND gd.activo`,
      [groupId, actor.id],
    );
    if (!found.length) throw new ForbiddenException('Grupo no asignado');
  }

  async list(actor: Identity, key: CatalogKey, query: Record<string, unknown>) {
    const config = this.repo.config(key);
    const { after, limit } = page(query, [
      ...(config.filters ?? []),
      ...(config.fields.activo ? ['activo'] : ['estado']),
    ]);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(
        manager,
        actor,
        key === 'grupos' ? [...readers, 'DOCENTE'] : readers,
      );
      const values: unknown[] = [after];
      const clauses = ['t.id>$1::bigint'];
      for (const filter of config.filters ?? []) {
        if (query[filter] !== undefined) {
          if (typeof query[filter] !== 'string')
            throw new BadRequestException('Filtro inválido');
          values.push(validId(query[filter]));
          clauses.push(`t.${config.fields[filter]}=$${values.length}::bigint`);
        }
      }
      if (query.activo !== undefined) {
        if (!['true', 'false'].includes(query.activo as string))
          throw new BadRequestException('Activo inválido');
        values.push(query.activo === 'true');
        clauses.push(`t.activo=$${values.length}`);
      }
      if (query.estado !== undefined) {
        const allowed =
          key === 'grupos'
            ? ['PLANIFICADO', 'ACTIVO', 'CERRADO']
            : ['PLANIFICADO', 'ABIERTO', 'CERRADO'];
        if (!allowed.includes(query.estado as string))
          throw new BadRequestException('Estado inválido');
        values.push(query.estado);
        clauses.push(`t.estado=$${values.length}`);
      }
      if (key === 'grupos' && !readers.some((role) => roles.includes(role))) {
        values.push(actor.id);
        clauses.push(`EXISTS (SELECT 1 FROM grupo_docentes gd JOIN docentes d ON d.id=gd.docente_id
          JOIN personas p ON p.id=d.persona_id JOIN usuarios u ON u.persona_id=p.id
          WHERE gd.grupo_id=t.id AND u.id=$${values.length} AND gd.activo AND d.activo AND p.activo)`);
      }
      values.push(limit);
      const items = (await manager.query(
        `SELECT t.* FROM ${config.table} t WHERE ${clauses.join(' AND ')} ORDER BY t.id LIMIT $${values.length}`,
        values,
      )) as Row[];
      return {
        items,
        nextCursor: items.length === limit ? String(items.at(-1)!.id) : null,
      };
    });
  }

  async get(actor: Identity, key: CatalogKey, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(
        manager,
        actor,
        key === 'grupos' ? [...readers, 'DOCENTE'] : readers,
      );
      if (key === 'grupos') await this.groupScope(manager, actor, roles, id);
      return this.repo.find(manager, key, id);
    });
  }

  private async active(
    manager: EntityManager,
    key: CatalogKey,
    id: unknown,
  ): Promise<Row> {
    const row = await this.repo.find(manager, key, String(id), true);
    if (row.activo === false || row.estado === 'CERRADO')
      throw new ConflictException('La referencia académica no está disponible');
    return row;
  }
  private async availableGroup(
    manager: EntityManager,
    row: Record<string, unknown>,
  ): Promise<void> {
    const period = await this.active(manager, 'periodos', row.periodo_id);
    const level = await this.active(manager, 'niveles', row.nivel_id);
    await this.active(manager, 'idiomas', level.idioma_id);
    await this.active(manager, 'turnos', row.turno_id);
    await this.active(manager, 'secciones', row.seccion_id);
    if (row.estado === 'ACTIVO' && period.estado !== 'ABIERTO')
      throw new ConflictException(
        'Para activar el grupo debe abrir el periodo',
      );
  }

  async save(
    actor: Identity,
    key: CatalogKey,
    body: object,
    ip?: string,
    id?: string,
  ) {
    if (id) validId(id);
    const data = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;
    const config = this.repo.config(key);
    const motivo = data.motivo as string | undefined;
    delete data.motivo;
    if (!Object.keys(data).some((field) => data[field] !== undefined))
      throw new BadRequestException('Indique al menos un cambio');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const before = id
        ? await this.repo.find(manager, key, id, true)
        : undefined;
      if (!id) Object.assign(data, { ...config.defaults, ...data });
      for (const field of config.immutable ?? []) {
        if (
          before &&
          data[field] !== undefined &&
          String(data[field] as string) !==
            String(before[config.fields[field]!] as string | number)
        )
          throw new ConflictException(
            'El contexto académico es inmutable; cree otro registro',
          );
      }
      const merged: Record<string, unknown> = { ...before };
      for (const [field, value] of Object.entries(data))
        if (value !== undefined) merged[config.fields[field]!] = value;
      const activating = !before || (data.activo === true && !before.activo);
      if (key === 'niveles' && activating)
        await this.active(manager, 'idiomas', merged.idioma_id);
      if (key === 'niveles' && data.prerrequisitoId)
        await this.active(manager, 'niveles', data.prerrequisitoId);
      if (key === 'unidades' && activating) {
        const level = await this.active(manager, 'niveles', merged.nivel_id);
        await this.active(manager, 'idiomas', level.idioma_id);
      }
      if (key === 'grupos' && (!before || data.estado === 'ACTIVO'))
        await this.availableGroup(manager, merged);
      const after = await this.repo.save(manager, key, data, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: !id
            ? 'CREATE'
            : data.activo === false
              ? 'INACTIVATE'
              : 'UPDATE',
          entidad: config.table,
          entidadId: String(after.id),
          anterior: before,
          nuevo: after,
          motivo,
          ip,
        },
        manager,
      );
      return after;
    });
  }

  async assign(
    actor: Identity,
    groupId: string,
    teacherId: string,
    dto: AssignmentDto,
    ip?: string,
  ) {
    validId(groupId);
    validId(teacherId);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const group = await this.repo.find(manager, 'grupos', groupId, true);
      const [teacher] = (await manager.query(
        `SELECT d.id,d.activo,p.activo AS persona_activa FROM docentes d
        JOIN personas p ON p.id=d.persona_id WHERE d.id=$1::bigint FOR UPDATE OF d,p`,
        [teacherId],
      )) as { id: string; activo: boolean; persona_activa: boolean }[];
      if (!teacher) throw new NotFoundException('Docente no encontrado');
      const [before] = (await manager.query(
        'SELECT * FROM grupo_docentes WHERE grupo_id=$1::bigint AND docente_id=$2::bigint FOR UPDATE',
        [groupId, teacherId],
      )) as Record<string, unknown>[];
      if (!before && !dto.activo)
        throw new BadRequestException('No existe asignación para inactivar');
      if (dto.activo) {
        if (
          !teacher.activo ||
          !teacher.persona_activa ||
          group.estado === 'CERRADO'
        )
          throw new ConflictException('Docente o grupo no disponible');
        await this.availableGroup(manager, group);
      }
      const [after] = (await manager.query(
        `INSERT INTO grupo_docentes (grupo_id,docente_id,es_titular,fecha_asignacion,activo)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (grupo_id,docente_id) DO UPDATE
        SET es_titular=EXCLUDED.es_titular,fecha_asignacion=EXCLUDED.fecha_asignacion,activo=EXCLUDED.activo RETURNING *`,
        [groupId, teacherId, dto.esTitular, dto.fechaAsignacion, dto.activo],
      )) as Record<string, unknown>[];
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: dto.activo ? 'ASSIGN' : 'INACTIVATE',
          entidad: 'grupo_docentes',
          entidadId: `${groupId}:${teacherId}`,
          anterior: before,
          nuevo: after,
          motivo: dto.motivo,
          ip,
        },
        manager,
      );
      return after;
    });
  }
  async assignments(actor: Identity, groupId: string) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      await this.repo.find(manager, 'grupos', groupId);
      return manager.query(
        'SELECT * FROM grupo_docentes WHERE grupo_id=$1::bigint ORDER BY docente_id',
        [groupId],
      ) as Promise<Record<string, unknown>[]>;
    });
  }
}
