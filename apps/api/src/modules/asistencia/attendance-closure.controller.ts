import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { sessionReaders } from './sessions.service.js';
import { CloseAttendanceDto } from './attendance-closure.dto.js';
import { AttendanceClosureService } from './attendance-closure.service.js';
import { attendanceClosureReviewSchema } from './attendance-closure.schema.js';

@Controller('asistencia/grupos/:grupoId/cierre')
@ApiTags('Cierre de asistencia — B15')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class AttendanceClosureController {
  constructor(
    @Inject(AttendanceClosureService)
    private readonly service: AttendanceClosureService,
  ) {}
  @Get()
  @Access(...sessionReaders)
  @ApiOperation({
    summary:
      'Revisar todo el grupo, pendientes, resúmenes e historial antes del cierre',
  })
  @ApiOkResponse({ schema: attendanceClosureReviewSchema })
  get(@Req() req: AuthRequest, @Param('grupoId') groupId: string) {
    return this.service.get(req.identity, groupId);
  }
  @Post()
  @Access('ADMIN')
  @ApiOperation({
    summary:
      'Cerrar asistencia revisada sin cerrar grupo, matrícula o acta de notas',
  })
  @ApiBody({ type: CloseAttendanceDto })
  @ApiCreatedResponse({ schema: attendanceClosureReviewSchema })
  @ApiConflictResponse({
    description: 'Ya cerrada, revisión obsoleta o pendientes no reconocidos',
  })
  close(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(CloseAttendanceDto)) dto: CloseAttendanceDto,
  ) {
    return this.service.close(req.identity, groupId, dto, req.ip);
  }
}
