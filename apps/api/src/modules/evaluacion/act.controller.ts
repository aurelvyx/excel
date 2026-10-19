import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { inputDto } from '../../common/validation.js';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { evaluationReaders } from './evaluation.service.js';
import { ActService } from './act.service.js';
import {
  CloseActDto,
  CorrectActAttendanceDto,
  CorrectActGradeDto,
} from './act.dto.js';
import {
  actDetailSchema,
  actsPageSchema,
  closedActSchema,
  correctedActSchema,
} from './act.schema.js';

@Controller('evaluacion/grupos/:grupoId/acta')
@ApiTags('Resultados y cierre de acta — B18')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class ActController {
  constructor(@Inject(ActService) private readonly service: ActService) {}
  @Get()
  @Access(...evaluationReaders)
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Revisar resultados y preparación del grupo completo; paginar el padrón sin confirmar resultados',
  })
  @ApiOkResponse({ schema: actsPageSchema })
  list(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, groupId, query);
  }
  @Post()
  @Access('ADMIN')
  @ApiBody({ type: CloseActDto })
  @ApiCreatedResponse({ schema: closedActSchema })
  @ApiConflictResponse({
    description:
      'Revisión obsoleta, acta previa, datos incompletos o asistencia abierta',
  })
  @ApiOperation({
    summary:
      'Cerrar acta y confirmar todos los resultados y matrículas en una transacción; sin reapertura',
  })
  close(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(CloseActDto)) dto: CloseActDto,
  ) {
    return this.service.close(req.identity, groupId, dto, req.ip);
  }
  @Patch('correccion-nota')
  @Access('ADMIN')
  @ApiBody({ type: CorrectActGradeDto })
  @ApiOkResponse({ schema: correctedActSchema })
  @ApiBadRequestResponse({ description: 'Nota, motivo o versiones inválidos' })
  @ApiConflictResponse({
    description: 'Nota/resultado obsoletos o sin procedencia del acta',
  })
  @ApiOperation({
    summary:
      'Corregir una nota cerrada con motivo e historial; recalcular su resultado atómicamente',
  })
  correctGrade(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(CorrectActGradeDto)) dto: CorrectActGradeDto,
  ) {
    return this.service.correctGrade(req.identity, groupId, dto, req.ip);
  }
  @Patch('correccion-asistencia')
  @Access('ADMIN')
  @ApiBody({ type: CorrectActAttendanceDto })
  @ApiOkResponse({ schema: correctedActSchema })
  @ApiBadRequestResponse({ description: 'Marca, motivo o versiones inválidos' })
  @ApiConflictResponse({
    description:
      'Marca/resultado obsoletos, sesión excluida o justificación protegida',
  })
  @ApiOperation({
    summary:
      'Corregir una asistencia computable cerrada con motivo e historial; recalcular el resultado en la misma transacción',
  })
  correctAttendance(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(CorrectActAttendanceDto)) dto: CorrectActAttendanceDto,
  ) {
    return this.service.correctAttendance(req.identity, groupId, dto, req.ip);
  }
  @Get(':matriculaId')
  @Access(...evaluationReaders)
  @ApiOperation({
    summary:
      'Consultar resultado, notas, sesiones computables e historial del intento con alcance del grupo',
  })
  @ApiOkResponse({ schema: actDetailSchema })
  detail(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('matriculaId') enrollmentId: string,
  ) {
    return this.service.detail(req.identity, groupId, enrollmentId);
  }
}
