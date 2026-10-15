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
import { evaluationReaders } from './evaluation.service.js';
import { GradesService } from './grades.service.js';
import { SaveGradesDto } from './grades.dto.js';
import {
  gradeHistorySchema,
  gradesPageSchema,
  savedGradesSchema,
} from './grades.schema.js';

@Controller('evaluacion/grupos/:grupoId/calificaciones')
@ApiTags('Calificaciones y promedio — B17')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class GradesController {
  constructor(@Inject(GradesService) private readonly service: GradesService) {}
  @Get()
  @Access(...evaluationReaders)
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Consultar notas y promedio por intento con la versión aprobada del grupo',
  })
  @ApiOkResponse({ schema: gradesPageSchema })
  list(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, groupId, query);
  }
  @Patch()
  @Access('DOCENTE')
  @ApiBody({ type: SaveGradesDto })
  @ApiOkResponse({ schema: savedGradesSchema })
  @ApiBadRequestResponse({
    description: 'Notas, versiones, duplicados o lote inválidos',
  })
  @ApiConflictResponse({
    description:
      'Nota obsoleta, matrícula inactiva, acta cerrada o criterios no aprobados',
  })
  @ApiOperation({
    summary:
      'Guardar hasta 2000 notas abiertas y recalcular exactamente el promedio y la nota oficial, con auditoría',
  })
  save(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(SaveGradesDto)) dto: SaveGradesDto,
  ) {
    return this.service.save(req.identity, groupId, dto, req.ip);
  }
  @Get(':matriculaId/indicadores/:indicadorId/historial')
  @Access(...evaluationReaders)
  @ApiOkResponse({ schema: gradeHistorySchema })
  @ApiOperation({
    summary:
      'Consultar historial de una nota sin exponer IP ni datos personales adicionales',
  })
  history(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('matriculaId') enrollmentId: string,
    @Param('indicadorId') indicatorId: string,
  ) {
    return this.service.history(
      req.identity,
      groupId,
      enrollmentId,
      indicatorId,
    );
  }
}
