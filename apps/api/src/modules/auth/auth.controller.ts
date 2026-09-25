import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto, ChangePasswordDto } from './auth.dto.js';
import { Public, SessionOnly, type AuthRequest } from './access.js';
import {
  COOKIE_NAME,
  cookieOptions,
  csrfToken,
  SESSION_MINUTES,
} from './security.js';
import { SessionDto } from './response.dto.js';

// expectedType asegura validación también bajo el transformador de Vitest, sin metadata emitida.
const input = (expectedType: typeof LoginDto | typeof ChangePasswordDto) =>
  new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

@ApiTags('Acceso')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'Origin',
  description: 'Origen autorizado; requerido para escrituras',
  required: false,
})
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: SessionDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiHeader({
    name: 'X-Requested-With',
    required: true,
    schema: { default: 'Excel-Web' },
  })
  @ApiOperation({
    summary:
      'Iniciar sesión; devuelve CSRF, cookie HttpOnly y datos mínimos del usuario',
  })
  async login(
    @Body(input(LoginDto)) dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.login(
      dto.nombreUsuario,
      dto.password,
      req.ip,
    );
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions(),
      maxAge: SESSION_MINUTES * 60000,
    });
    const { sessionId: _sessionId, ...user } =
      await this.auth.authenticate(token);
    return { user, csrfToken: csrfToken(token) };
  }

  @SessionOnly()
  @Get('me')
  @ApiOkResponse({ type: SessionDto })
  @ApiOperation({
    summary:
      'Consultar la sesión actual y recuperar CSRF al recargar la aplicación',
  })
  me(@Req() req: AuthRequest) {
    const { sessionId: _sessionId, ...user } = req.identity;
    return { user, csrfToken: csrfToken(req.sessionToken) };
  }

  @SessionOnly()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({ summary: 'Revocar la sesión actual' })
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.identity, req.ip);
    res.clearCookie(COOKIE_NAME, cookieOptions());
  }

  @SessionOnly()
  @Post('password')
  @HttpCode(204)
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: 'Cambiar contraseña propia y revocar todas sus sesiones',
  })
  async changePassword(
    @Body(input(ChangePasswordDto)) dto: ChangePasswordDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(
      req.identity,
      dto.passwordActual,
      dto.passwordNueva,
      req.ip,
    );
    res.clearCookie(COOKIE_NAME, cookieOptions());
  }
}
