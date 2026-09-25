import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { ACCESS, type AuthRequest, type Policy } from './access.js';
import { COOKIE_NAME, matchesCsrf, trustedOrigins } from './security.js';
import { AuditService } from '../control/audit.service.js';

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly origins = trustedOrigins();
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const policy = this.reflector.getAllAndOverride<Policy>(ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      unsafe &&
      (!this.origins.has(req.get('origin') || '') ||
        !req.is('application/json'))
    ) {
      throw new ForbiddenException('Origen o tipo de contenido no permitido');
    }
    if (policy?.public) {
      if (unsafe && req.get('x-requested-with') !== 'Excel-Web')
        throw new ForbiddenException('Falta la cabecera de solicitud');
      return true;
    }
    req.sessionToken = req.cookies?.[COOKIE_NAME] as string;
    req.identity = await this.auth.authenticate(req.sessionToken);
    if (unsafe && !matchesCsrf(req.get('x-csrf-token'), req.sessionToken))
      throw new ForbiddenException('CSRF inválido');
    if (
      !policy ||
      (req.identity.requiere_cambio_clave && !policy.temporary) ||
      (policy.roles?.length &&
        !policy.roles.some((role) => req.identity.roles.includes(role)))
    ) {
      await this.audit.record({
        usuarioId: req.identity.id,
        accion: 'ACCESS_DENIED',
        entidad: 'api',
        entidadId:
          `${context.getClass().name}.${context.getHandler().name}`.slice(
            0,
            80,
          ),
        ip: req.ip,
      });
      throw new ForbiddenException(
        req.identity.requiere_cambio_clave
          ? 'Debe cambiar la contraseña temporal'
          : 'Acceso denegado',
      );
    }
    return true;
  }
}
