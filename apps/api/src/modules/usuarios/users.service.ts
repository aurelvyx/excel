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
import { AuditService } from '../control/audit.service.js';
import type { Identity, Role } from '../auth/access.js';
import { hashPassword } from '../auth/security.js';
import type {
  CreateUserDto,
  UpdateUserDto,
  AssignRolesDto,
} from './users.dto.js';

type UserView = {
  id: string;
  nombre_usuario: string;
  persona_id: string | null;
  activo: boolean;
  requiere_cambio_clave: boolean;
  roles: Role[];
};
const projection = `u.id,u.nombre_usuario,u.persona_id,u.activo,u.requiere_cambio_clave,
  ARRAY(SELECT r.codigo FROM roles r JOIN usuario_roles ur ON ur.rol_id=r.id
    WHERE ur.usuario_id=u.id AND r.activo ORDER BY r.codigo) AS roles`;

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async assertAdmin(
    manager: EntityManager,
    actor: Identity,
  ): Promise<void> {
    // Una política común serializa bootstrap, modificaciones de usuarios y cambios de roles.
    await manager.query('SELECT pg_advisory_xact_lock(20260924, 4)');
    const rows: unknown[] = await manager.query(
      `SELECT u.id FROM usuarios u
      JOIN usuario_roles ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id
      JOIN sesiones_usuario s ON s.usuario_id=u.id
      WHERE u.id=$1 AND u.activo AND NOT u.requiere_cambio_clave AND r.codigo='ADMIN' AND r.activo
        AND s.id=$2 AND s.revocado_at IS NULL AND s.expira_at>CURRENT_TIMESTAMP FOR SHARE OF u,s`,
      [actor.id, actor.sessionId],
    );
    if (!rows.length)
      throw new ForbiddenException('Acceso administrativo requerido');
  }

  private async view(manager: EntityManager, id: string): Promise<UserView> {
    const [row] = (await manager.query(
      `SELECT ${projection} FROM usuarios u WHERE u.id=$1`,
      [id],
    )) as UserView[];
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return row;
  }

  async list(actor: Identity, after: string, limit: number) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !/^(0|[1-9][0-9]{0,17})$/.test(after)
    ) {
      throw new BadRequestException('Paginación inválida');
    }
    return this.source.transaction(async (manager) => {
      await this.assertAdmin(manager, actor);
      const rows = (await manager.query(
        `SELECT ${projection} FROM usuarios u WHERE u.id>$1 ORDER BY u.id LIMIT $2`,
        [after, limit],
      )) as UserView[];
      return {
        items: rows,
        nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
      };
    });
  }

  async roles(actor: Identity) {
    return this.source.transaction(async (manager) => {
      await this.assertAdmin(manager, actor);
      return manager.query(
        'SELECT codigo,nombre FROM roles WHERE activo ORDER BY codigo',
      ) as Promise<{ codigo: Role; nombre: string }[]>;
    });
  }

  private async replaceRoles(
    manager: EntityManager,
    id: string,
    roles: Role[],
    actorId: string,
  ): Promise<void> {
    const found = (await manager.query(
      'SELECT id FROM roles WHERE codigo=ANY($1::varchar[]) AND activo',
      [roles],
    )) as { id: number }[];
    if (found.length !== roles.length)
      throw new BadRequestException('Roles no disponibles');
    await manager.query('DELETE FROM usuario_roles WHERE usuario_id=$1', [id]);
    for (const role of found) {
      await manager.query(
        'INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por) VALUES ($1,$2,$3)',
        [id, role.id, actorId],
      );
    }
  }

  private async protectLastAdmin(manager: EntityManager): Promise<void> {
    const rows: unknown[] =
      await manager.query(`SELECT u.id FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id=u.id
      JOIN roles r ON r.id=ur.rol_id WHERE u.activo AND r.activo AND r.codigo='ADMIN' LIMIT 1`);
    if (!rows.length)
      throw new ConflictException(
        'Debe conservarse al menos un administrador activo',
      );
  }

  async create(actor: Identity, dto: CreateUserDto, ip?: string) {
    const encoded = await hashPassword(dto.passwordTemporal);
    return this.source.transaction(async (manager) => {
      await this.assertAdmin(manager, actor);
      const [user] = (await manager.query(
        `INSERT INTO usuarios (nombre_usuario,password_hash,persona_id,requiere_cambio_clave)
        VALUES ($1,$2,$3,true) RETURNING id`,
        [dto.nombreUsuario, encoded, dto.personaId ?? null],
      )) as { id: string }[];
      await this.replaceRoles(manager, user!.id, dto.roles, actor.id);
      const result = await this.view(manager, user!.id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE',
          entidad: 'usuarios',
          entidadId: user!.id,
          nuevo: result,
          ip,
        },
        manager,
      );
      return result;
    });
  }

  async update(actor: Identity, id: string, dto: UpdateUserDto, ip?: string) {
    if (
      dto.activo === undefined &&
      dto.nombreUsuario === undefined &&
      dto.personaId === undefined
    ) {
      throw new BadRequestException('Indique al menos un cambio');
    }
    return this.source.transaction(async (manager) => {
      await this.assertAdmin(manager, actor);
      await manager.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const before = await this.view(manager, id);
      await manager.query(
        'UPDATE usuarios SET nombre_usuario=$1,activo=$2,persona_id=$3 WHERE id=$4',
        [
          dto.nombreUsuario ?? before.nombre_usuario,
          dto.activo ?? before.activo,
          dto.personaId === undefined ? before.persona_id : dto.personaId,
          id,
        ],
      );
      await this.protectLastAdmin(manager);
      await manager.query(
        'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND revocado_at IS NULL',
        [id],
      );
      const result = await this.view(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: dto.activo === false ? 'INACTIVATE' : 'UPDATE',
          entidad: 'usuarios',
          entidadId: id,
          anterior: before,
          nuevo: result,
          motivo: dto.motivo,
          ip,
        },
        manager,
      );
      return result;
    });
  }

  async assignRoles(
    actor: Identity,
    id: string,
    dto: AssignRolesDto,
    ip?: string,
  ) {
    return this.source.transaction(async (manager) => {
      await this.assertAdmin(manager, actor);
      await manager.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const before = await this.view(manager, id);
      await this.replaceRoles(manager, id, dto.roles, actor.id);
      await this.protectLastAdmin(manager);
      await manager.query(
        'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND revocado_at IS NULL',
        [id],
      );
      const result = await this.view(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'ROLES_CHANGED',
          entidad: 'usuarios',
          entidadId: id,
          anterior: { roles: before.roles },
          nuevo: { roles: result.roles },
          motivo: dto.motivo,
          ip,
        },
        manager,
      );
      return result;
    });
  }
}
