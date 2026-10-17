import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { inputDto } from '../../common/validation.js';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { ExportReportDto } from './reports.dto.js';
import { ReportsService, reportReaders } from './reports.service.js';
import { reportHistorySchema, reportPreviewSchema } from './reports.schema.js';
import { reportTypes } from './report.model.js';

@Controller('reportes/grupos/:grupoId')
@ApiTags('Reportes XLSX de demostración — B19')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido al generar una exportación',
})
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly service: ReportsService,
  ) {}

  @Get()
  @Access(...reportReaders)
  @ApiQuery({ name: 'tipo', enum: reportTypes })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Revisar borrador y datos del grupo completo antes de exportar; la lectura no registra exportaciones',
  })
  @ApiOkResponse({ schema: reportPreviewSchema })
  @ApiConflictResponse({
    description: 'Código de idioma sin plantilla de demostración',
  })
  preview(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.preview(req.identity, groupId, query);
  }

  @Post('exportaciones')
  @Access(...reportReaders)
  @ApiBody({ type: ExportReportDto })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiCreatedResponse({
    description:
      'BORRADOR XLSX generado y registrado atómicamente; no acredita la entrega del archivo',
    schema: { type: 'string', format: 'binary' },
    headers: {
      'X-Exportacion-Id': {
        description: 'ID del registro de generación',
        schema: { type: 'string' },
      },
      'Content-Disposition': { schema: { type: 'string' } },
    },
  })
  @ApiConflictResponse({
    description:
      'Revisión obsoleta, plantilla cambiada, límites excedidos o sin criterios aprobados para la matriz',
  })
  @ApiOperation({
    summary:
      'Generar XLSX de demostración con revisión vigente y registrar hash y auditoría antes de responder',
  })
  async export(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Body(inputDto(ExportReportDto)) dto: ExportReportDto,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw new BadRequestException('Filtro no permitido');
    const generated = await this.service.export(
      req.identity,
      groupId,
      dto,
      req.ip,
    );
    response.setHeader('X-Exportacion-Id', generated.id);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(generated.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${generated.filename}"`,
      length: generated.buffer.length,
    });
  }

  @Get('exportaciones')
  @Access(...reportReaders)
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'Consultar metadatos de generación; docente solo matriz de sus grupos, sin descarga histórica de binarios',
  })
  @ApiOkResponse({ schema: reportHistorySchema })
  history(
    @Req() req: AuthRequest,
    @Param('grupoId') groupId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.history(req.identity, groupId, query);
  }
}
