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
import { EnrollmentDto, ActivationDto } from './enrollments.dto.js';
import { EnrollmentsService, enrollmentRoles } from './enrollments.service.js';
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
