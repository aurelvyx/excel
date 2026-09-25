import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { verify } from 'argon2';
import { AuditService } from '../control/audit.service.js';
import { digest, newToken, hashPassword, SESSION_MINUTES } from './security.js';
import type { Identity, Role } from './access.js';

type Account = { id: string; password_hash: string; activo: boolean };

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(newToken());
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(name: string, password: string, ip?: string) {
    const [account] = (await this.source.query(
      'SELECT id,password_hash,activo FROM usuarios WHERE nombre_usuario=$1',
      [name],
    )) as Account[];
    const valid = await verify(
      account?.password_hash || (await this.dummyHash),
      password,
    ).catch(() => false);
    if (
      !valid ||
      !account?.activo ||
      !(await this.roles(this.source.manager, account.id)).length
    ) {
      await this.audit.record({
        usuarioId: account?.id ?? null,
        accion: 'LOGIN_FAILED',
        entidad: 'usuarios',
        entidadId: account?.id ?? 'desconocido',
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.source.transaction(async (manager) => {
      const [current] = (await manager.query(
        'SELECT id,password_hash,activo FROM usuarios WHERE id=$1 FOR UPDATE',
        [account.id],
      )) as Account[];
      if (!current?.activo || current.password_hash !== account.password_hash)
        throw new UnauthorizedException('Credenciales inválidas');
      const roles = await this.roles(manager, account.id);
      if (!roles.length) {
        // No se otorga acceso a cuentas sin roles activos.
        throw new UnauthorizedException('Credenciales inválidas');
      }
      const token = newToken();
      const [session] = (await manager.query(
        `INSERT INTO sesiones_usuario (usuario_id,token_hash,expira_at)
        VALUES ($1,$2,CURRENT_TIMESTAMP + INTERVAL '${SESSION_MINUTES} minutes') RETURNING id`,
        [account.id, digest(token)],
      )) as { id: string }[];
      await manager.query(
        'UPDATE usuarios SET ultimo_acceso_at=CURRENT_TIMESTAMP WHERE id=$1',
        [account.id],
      );
      await this.audit.record(
        {
          usuarioId: account.id,
          accion: 'LOGIN',
          entidad: 'sesiones_usuario',
          entidadId: session!.id,
          ip,
        },
        manager,
      );
      return { token };
    });
  }

  async roles(manager: EntityManager, id: string): Promise<Role[]> {
    const rows = (await manager.query(
      `SELECT r.codigo FROM roles r JOIN usuario_roles ur ON ur.rol_id=r.id
      WHERE ur.usuario_id=$1 AND r.activo ORDER BY r.codigo`,
      [id],
    )) as { codigo: Role }[];
    return rows.map((row) => row.codigo);
  }

  async authenticate(token: unknown): Promise<Identity> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Sesión inválida o vencida');
    const [row] = (await this.source.query(
      `SELECT u.id,u.nombre_usuario,u.requiere_cambio_clave,s.id AS "sessionId"
      FROM sesiones_usuario s JOIN usuarios u ON u.id=s.usuario_id
      WHERE s.token_hash=$1 AND s.revocado_at IS NULL AND s.expira_at>CURRENT_TIMESTAMP AND u.activo`,
      [digest(token)],
    )) as Omit<Identity, 'roles'>[];
    if (!row) throw new UnauthorizedException('Sesión inválida o vencida');
    const roles = await this.roles(this.source.manager, row.id);
    if (!roles.length)
      throw new UnauthorizedException('Sesión inválida o vencida');
    return { ...row, roles };
  }

  async logout(identity: Identity, ip?: string): Promise<void> {
    await this.source.transaction(async (manager) => {
      await manager.query(
        'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE id=$1 AND revocado_at IS NULL',
        [identity.sessionId],
      );
      await this.audit.record(
        {
          usuarioId: identity.id,
          accion: 'LOGOUT',
          entidad: 'sesiones_usuario',
          entidadId: identity.sessionId,
          ip,
        },
        manager,
      );
    });
  }

  async changePassword(
    identity: Identity,
    oldPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    if (oldPassword === newPassword)
      throw new BadRequestException('La contraseña nueva debe ser diferente');
    const encoded = await hashPassword(newPassword);
    await this.source.transaction(async (manager) => {
      const [account] = (await manager.query(
        'SELECT id,password_hash,activo FROM usuarios WHERE id=$1 FOR UPDATE',
        [identity.id],
      )) as Account[];
      const [session] = await manager.query(
        `SELECT id FROM sesiones_usuario
        WHERE id=$1 AND revocado_at IS NULL AND expira_at>CURRENT_TIMESTAMP`,
        [identity.sessionId],
      );
      if (
        !account?.activo ||
        !session ||
        !(await verify(account.password_hash, oldPassword).catch(() => false))
      ) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      await manager.query(
        'UPDATE usuarios SET password_hash=$1,requiere_cambio_clave=false WHERE id=$2',
        [encoded, identity.id],
      );
      await manager.query(
        'UPDATE sesiones_usuario SET revocado_at=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND revocado_at IS NULL',
        [identity.id],
      );
      await this.audit.record(
        {
          usuarioId: identity.id,
          accion: 'PASSWORD_CHANGED',
          entidad: 'usuarios',
          entidadId: identity.id,
          ip,
        },
        manager,
      );
    });
  }
}
