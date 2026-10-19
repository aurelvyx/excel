import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
import {
  ApplyEvaluationPlanDto,
  ApproveEvaluationPlanDto,
  CreateEvaluationPlanDto,
  UpdateEvaluationPlanDto,
} from './evaluation.dto.js';
import { EvaluationService, evaluationReaders } from './evaluation.service.js';
import {
  evaluationLevelsSchema,
  evaluationPlansSchema,
  evaluationPlanViewSchema,
  groupEvaluationSchema,
} from './evaluation.schema.js';

@Controller('evaluacion')
@ApiTags('Evaluaciones y criterios — B16')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
@Access(...evaluationReaders)
export class EvaluationController {
  constructor(
    @Inject(EvaluationService) private readonly service: EvaluationService,
  ) {}
  @Get('niveles')
  @ApiOperation({
    summary: 'Consultar niveles dentro del alcance académico del usuario',
  })
  @ApiOkResponse({ schema: evaluationLevelsSchema })
  levels(@Req() req: AuthRequest) {
    return this.service.levels(req.identity);
  }
  @Get('niveles/:nivelId/planes')
  @ApiOperation({
    summary:
      'Consultar versiones de criterios de un nivel, sin crear pesos oficiales',
  })
  @ApiOkResponse({ schema: evaluationPlansSchema })
  list(@Req() req: AuthRequest, @Param('nivelId') id: string) {
    return this.service.list(req.identity, id);
  }
  @Get('planes/:planId')
  @ApiOkResponse({ schema: evaluationPlanViewSchema })
  get(@Req() req: AuthRequest, @Param('planId') id: string) {
    return this.service.get(req.identity, id);
  }
  @Post('niveles/:nivelId/planes')
  @Access('ADMIN')
  @ApiBody({ type: CreateEvaluationPlanDto })
  @ApiCreatedResponse({ schema: evaluationPlanViewSchema })
  @ApiOperation({
    summary: 'Crear borrador versionado de componentes e indicadores del nivel',
  })
  create(
    @Req() req: AuthRequest,
    @Param('nivelId') id: string,
    @Body(inputDto(CreateEvaluationPlanDto)) dto: CreateEvaluationPlanDto,
  ) {
    return this.service.create(req.identity, id, dto, req.ip);
  }
  @Patch('planes/:planId')
  @Access('ADMIN')
  @ApiBody({ type: UpdateEvaluationPlanDto })
  @ApiOkResponse({ schema: evaluationPlanViewSchema })
  @ApiConflictResponse({
    description: 'Revisión obsoleta o versión aprobada inmutable',
  })
  update(
    @Req() req: AuthRequest,
    @Param('planId') id: string,
    @Body(inputDto(UpdateEvaluationPlanDto)) dto: UpdateEvaluationPlanDto,
  ) {
    return this.service.update(req.identity, id, dto, req.ip);
  }
  @Post('planes/:planId/aprobacion')
  @Access('ADMIN')
  @ApiBody({ type: ApproveEvaluationPlanDto })
  @ApiCreatedResponse({ schema: evaluationPlanViewSchema })
  @ApiConflictResponse({
    description:
      'Criterios incompletos, suma distinta de 100 % o revisión obsoleta',
  })
  @ApiOperation({
    summary:
      'Registrar aprobación explícita de fórmula y pesos con referencia del centro',
  })
  approve(
    @Req() req: AuthRequest,
    @Param('planId') id: string,
    @Body(inputDto(ApproveEvaluationPlanDto)) dto: ApproveEvaluationPlanDto,
  ) {
    return this.service.approve(req.identity, id, dto, req.ip);
  }
  @Get('grupos/:grupoId/configuracion')
  @ApiOkResponse({ schema: groupEvaluationSchema })
  @ApiOperation({
    summary:
      'Consultar estructura aplicada y datos faltantes para una futura acta; no ejecuta cierre',
  })
  group(@Req() req: AuthRequest, @Param('grupoId') id: string) {
    return this.service.group(req.identity, id);
  }
  @Post('grupos/:grupoId/configuracion')
  @Access('ADMIN', 'DOCENTE')
  @ApiBody({ type: ApplyEvaluationPlanDto })
  @ApiCreatedResponse({ schema: groupEvaluationSchema })
  @ApiConflictResponse({
    description:
      'Versión no aprobada, otro nivel o grupo ya configurado/histórico',
  })
  @ApiOperation({
    summary:
      'Aplicar una sola vez criterios aprobados al grupo autorizado, conservando su versión',
  })
  apply(
    @Req() req: AuthRequest,
    @Param('grupoId') id: string,
    @Body(inputDto(ApplyEvaluationPlanDto)) dto: ApplyEvaluationPlanDto,
  ) {
    return this.service.apply(req.identity, id, dto, req.ip);
  }
}
