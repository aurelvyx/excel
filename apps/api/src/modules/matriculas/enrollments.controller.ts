import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
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
  EnrollmentDto,
  ActivationDto,
  ChangeGroupDto,
} from './enrollments.dto.js';
import {
  EnrollmentsService,
  enrollmentRoles,
  enrollmentReaders,
} from './enrollments.service.js';
import { enrollmentSchema } from './enrollments.schema.js';
@Controller('matriculas')
@ApiTags('Matrículas — B08')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
@Access(...enrollmentRoles)
export class EnrollmentsController {
  constructor(
    @Inject(EnrollmentsService) private readonly service: EnrollmentsService,
  ) {}
  @Post()
  @ApiBody({ type: EnrollmentDto })
  @ApiCreatedResponse({ schema: enrollmentSchema })
  @ApiOperation({
    summary:
      'Crear solicitud pendiente de nivel completo; no reserva vacante ni voucher',
  })
  create(
    @Req() req: AuthRequest,
    @Body(inputDto(EnrollmentDto)) dto: EnrollmentDto,
  ) {
    return this.service.create(req.identity, dto, req.ip);
  }
  @Get('grupos')
  @Access(...enrollmentReaders)
  @ApiOperation({
    summary: 'Grupos de un periodo con matriculados y pendientes',
  })
  listGroups(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.listGroups(req.identity, query);
  }
  @Get()
  @Access(...enrollmentReaders)
  @ApiOperation({
    summary: 'Nómina de matrículas de un grupo (exige grupoId)',
  })
  roster(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.roster(req.identity, query);
  }
  @Patch(':id/grupo')
  @ApiBody({ type: ChangeGroupDto })
  @ApiOkResponse({ schema: enrollmentSchema })
  @ApiOperation({
    summary:
      'Cambiar a otro grupo del mismo periodo y nivel, sin registros académicos; con motivo y auditoría',
  })
  changeGroup(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(inputDto(ChangeGroupDto)) dto: ChangeGroupDto,
  ) {
    return this.service.changeGroup(req.identity, id, dto, req.ip);
  }
  @Get(':id')
  @ApiOkResponse({ schema: enrollmentSchema })
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.get(req.identity, id);
  }
  @Patch(':id/activar')
  @ApiBody({ type: ActivationDto })
  @ApiOkResponse({ schema: enrollmentSchema })
  @ApiOperation({
    summary:
      'Confirmar activación con voucher validado y auditoría en una transacción',
  })
  activate(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(inputDto(ActivationDto)) dto: ActivationDto,
  ) {
    return this.service.activate(req.identity, id, dto, req.ip);
  }
}
