import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { AttendanceService } from './attendance.service.js';
import { SaveAttendanceDto } from './attendance.dto.js';
import { CorrectAttendanceDto } from './attendance-closure.dto.js';
import {
  attendancePageSchema,
  savedAttendanceSchema,
  attendanceHistorySchema,
} from './attendance.schema.js';
import { sessionReaders } from './sessions.service.js';

@Controller('asistencia/grupos/:grupoId/sesiones/:sesionId/asistencias')
@ApiTags('Asistencia — B12/B13/B15')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly service: AttendanceService,
  ) {}
  @Get()
  @Access(...sessionReaders)
  @ApiOkResponse({ schema: attendancePageSchema })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Consultar matriz y resumen de asistencia por intento; docente solo en su alcance',
  })
  list(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('sesionId') sessionId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, groupId, sessionId, query);
  }
  @Patch()
  @Access('DOCENTE')
  @ApiBody({ type: SaveAttendanceDto })
  @ApiOkResponse({ schema: savedAttendanceSchema })
  @ApiBadRequestResponse({
    description: 'Código, comentario, lote o matrícula inválidos',
  })
  @ApiConflictResponse({
    description:
      'Versión obsoleta, matrícula inactiva, registro cerrado, sesión cancelada o futura',
  })
  @ApiOperation({
    summary:
      'Guardar hasta 100 marcas P/F/T/J y recalcular asistencia; confirma clase realizada y conserva auditoría',
  })
  save(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('sesionId') sessionId: string,
    @Body(inputDto(SaveAttendanceDto)) dto: SaveAttendanceDto,
  ) {
    return this.service.save(req.identity, groupId, sessionId, dto, req.ip);
  }
  @Patch('correccion')
  @Access('ADMIN')
  @ApiOperation({
    summary:
      'Corregir una marca después del cierre con motivo, versión, auditoría y recálculo',
  })
  @ApiBody({ type: CorrectAttendanceDto })
  @ApiOkResponse({ schema: savedAttendanceSchema })
  @ApiConflictResponse({
    description:
      'Versión o cierre obsoleto, sesión excluida o marca J con expediente protegido',
  })
  correct(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('sesionId') sessionId: string,
    @Body(inputDto(CorrectAttendanceDto)) dto: CorrectAttendanceDto,
  ) {
    return this.service.correct(req.identity, groupId, sessionId, dto, req.ip);
  }
  @Get(':matriculaId/historial')
  @Access(...sessionReaders)
  @ApiOperation({
    summary:
      'Consultar decisiones de una asistencia con usuario, fecha, motivo y valores anterior/nuevo',
  })
  @ApiOkResponse({ schema: attendanceHistorySchema })
  history(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('sesionId') sessionId: string,
    @Param('matriculaId') enrollmentId: string,
  ) {
    return this.service.history(req.identity, groupId, sessionId, enrollmentId);
  }
}
