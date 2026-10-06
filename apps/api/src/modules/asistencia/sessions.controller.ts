import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { SessionsService, sessionReaders } from './sessions.service.js';
import { ScheduleSessionsDto } from './sessions.dto.js';
import { sessionBatchSchema, sessionsPageSchema } from './sessions.schema.js';

@Controller('asistencia/grupos/:grupoId/sesiones')
@ApiTags('Sesiones de clase — B11')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly service: SessionsService,
  ) {}

  @Get()
  @Access(...sessionReaders)
  @ApiOkResponse({ schema: sessionsPageSchema })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Consultar sesiones del grupo y permisos efectivos; docente solo en su alcance',
  })
  list(
    @Req() req: AuthRequest,
    @Param('grupoId') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, id, query);
  }

  @Post()
  @Access('ADMIN', 'DOCENTE')
  @ApiBody({ type: ScheduleSessionsDto })
  @ApiCreatedResponse({ schema: sessionBatchSchema })
  @ApiOperation({
    summary:
      'Programar entre 1 y 100 fechas reales en una transacción; no registra marcas ni calcula porcentajes',
  })
  schedule(
    @Req() req: AuthRequest,
    @Param('grupoId') id: string,
    @Body(inputDto(ScheduleSessionsDto)) dto: ScheduleSessionsDto,
  ) {
    return this.service.schedule(req.identity, id, dto, req.ip);
  }
}
