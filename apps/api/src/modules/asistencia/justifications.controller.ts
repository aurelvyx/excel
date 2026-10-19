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
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { sessionReaders } from './sessions.service.js';
import { JustificationsService } from './justifications.service.js';
import {
  CreateJustificationDto,
  RecoverJustificationDto,
  ResolveJustificationDto,
} from './justifications.dto.js';
import {
  justificationDetailSchema,
  justificationPageSchema,
  justificationRowSchema,
} from './justifications.schema.js';

@Controller('asistencia/grupos/:grupoId/justificaciones')
@ApiTags('Justificaciones — B14')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class JustificationsController {
  constructor(
    @Inject(JustificationsService)
    private readonly service: JustificationsService,
  ) {}
  @Get()
  @Access(...sessionReaders)
  @ApiOperation({
    summary:
      'Consultar marcas J y solicitudes por grupo e intento; docente solo en su alcance',
  })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Documento, matrícula o nombre',
  })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: [
      'SIN_SOLICITUD',
      'PENDIENTE',
      'APROBADA',
      'RECHAZADA',
      'RECUPERADA',
      'NO_RECUPERADA',
    ],
  })
  @ApiOkResponse({ schema: justificationPageSchema })
  list(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, groupId, query);
  }
  @Get(':id')
  @Access(...sessionReaders)
  @ApiOperation({
    summary:
      'Consultar una justificación con responsables e historial inmutable de decisiones',
  })
  @ApiOkResponse({ schema: justificationDetailSchema })
  get(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('id') id: string,
  ) {
    return this.service.get(req.identity, groupId, id);
  }
  @Post()
  @Access('ADMIN', 'SECRETARIA')
  @ApiOperation({
    summary:
      'Registrar motivo y fecha sobre una marca J existente, sin modificar la marca docente',
  })
  @ApiBody({ type: CreateJustificationDto })
  @ApiCreatedResponse({ schema: justificationRowSchema })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o asistencia distinta de J',
  })
  @ApiConflictResponse({
    description: 'Ya existe solicitud, versión obsoleta o registro cerrado',
  })
  create(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(CreateJustificationDto)) dto: CreateJustificationDto,
  ) {
    return this.service.create(req.identity, groupId, dto, req.ip);
  }
  @Patch(':id/resolucion')
  @Access('ADMIN', 'SECRETARIA')
  @ApiOperation({
    summary:
      'Aprobar o rechazar una solicitud pendiente; conserva observación, responsable, fecha y auditoría',
  })
  @ApiBody({ type: ResolveJustificationDto })
  @ApiOkResponse({ schema: justificationRowSchema })
  @ApiConflictResponse({
    description: 'Estado incompatible, versión obsoleta o registro cerrado',
  })
  resolve(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('id') id: string,
    @Body(inputDto(ResolveJustificationDto)) dto: ResolveJustificationDto,
  ) {
    return this.service.resolve(req.identity, groupId, id, dto, req.ip);
  }
  @Patch(':id/recuperacion')
  @Access('ADMIN', 'DOCENTE')
  @ApiOperation({
    summary:
      'Confirmar recuperación cumplida o no cumplida de una justificación aprobada; docente asignado o administrador',
  })
  @ApiBody({ type: RecoverJustificationDto })
  @ApiOkResponse({ schema: justificationRowSchema })
  @ApiConflictResponse({
    description: 'Estado incompatible, versión obsoleta o registro cerrado',
  })
  recover(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Param('id') id: string,
    @Body(inputDto(RecoverJustificationDto)) dto: RecoverJustificationDto,
  ) {
    return this.service.recover(req.identity, groupId, id, dto, req.ip);
  }
}
