import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import {
  BackupsService,
  backupStates,
  backupTypes,
} from './backups.service.js';
import { backupPageSchema } from './backups.schema.js';

@Controller('control/respaldos')
@ApiTags('Respaldos — B21')
@ApiCookieAuth(COOKIE_NAME)
export class BackupsController {
  constructor(
    @Inject(BackupsService) private readonly service: BackupsService,
  ) {}

  @Get()
  @Access('ADMIN')
  @ApiOperation({
    summary:
      'Consultar operaciones y última restauración completa comprobada; no descarga archivos ni ejecuta restauraciones',
  })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tipo', required: false, enum: backupTypes })
  @ApiQuery({ name: 'estado', required: false, enum: backupStates })
  @ApiOkResponse({ schema: backupPageSchema })
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.list(req.identity, query);
  }
}
