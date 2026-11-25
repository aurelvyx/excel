import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { AuditService } from './audit.service.js';
import { RevertAuditDto } from './audit.dto.js';

const revertPipe = new ValidationPipe({
  expectedType: RevertAuditDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('Auditoría y Seguridad')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  description: 'Requerido para escrituras',
  required: false,
})
@Access('ADMIN', 'SECRETARIA')
@Controller('auditoria')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar historial de modificaciones con datos anteriores y nuevos (solo ADMIN y SECRETARIA)',
  })
  @ApiOkResponse({ description: 'Listado de eventos de modificación' })
  @ApiQuery({ name: 'entidad', required: false, type: String })
  @ApiQuery({ name: 'usuario', required: false, type: String })
  @ApiQuery({ name: 'estado', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listModifications(
    @Req() req: AuthRequest,
    @Query('entidad') entidad?: string,
    @Query('usuario') usuario?: string,
    @Query('estado') estado?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listModifications(req.identity, {
      entidad,
      usuario,
      estado,
      limit: limit ? Number(limit) : 120,
    });
  }

  @Post(':id/revertir')
  @ApiOperation({
    summary:
      'Revertir un registro modificado a su valor anterior (solo ADMIN y SECRETARIA)',
  })
  @ApiBody({ type: RevertAuditDto })
  @ApiOkResponse({ description: 'Modificación revertida con éxito' })
  revert(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body(revertPipe) dto: RevertAuditDto,
  ) {
    return this.audit.revertModification(req.identity, id, dto, req.ip);
  }
}

