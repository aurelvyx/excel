import {
  Body,
  applyDecorators,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import {
  catalogs,
  type Catalog,
  type CatalogKey,
  readers,
} from './catalogs.js';
import { catalogSchema, assignmentSchema } from './offer.schema.js';
import { pageSchema } from '../../common/http-schema.js';
import { OfferService } from './offer.service.js';
import { AssignmentDto } from './offer.dto.js';

function catalogController(key: CatalogKey) {
  const config: Catalog = catalogs[key];
  const filters = applyDecorators(
    ...[
      ...(config.filters ?? []),
      config.fields.activo ? 'activo' : 'estado',
    ].map((name) => ApiQuery({ name, required: false, type: String })),
  );
  @Controller(`oferta/${key}`)
  @ApiTags(`Oferta: ${key}`)
  @ApiCookieAuth(COOKIE_NAME)
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: false,
    description: 'Requerido en escrituras',
  })
  class CatalogController {
    constructor(@Inject(OfferService) readonly service: OfferService) {}
    @Get()
    @Access(...(key === 'grupos' ? [...readers, 'DOCENTE' as const] : readers))
    @ApiOperation({
      summary: `Listar ${key}; los docentes solo consultan sus grupos`,
    })
    @ApiQuery({ name: 'after', required: false, type: String })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @filters
    @ApiOkResponse({ schema: pageSchema(catalogSchema(key)) })
    list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
      return this.service.list(req.identity, key, query);
    }
    @Get(':id')
    @Access(...(key === 'grupos' ? [...readers, 'DOCENTE' as const] : readers))
    @ApiOperation({ summary: `Consultar ${key} por ID` })
    @ApiOkResponse({ schema: catalogSchema(key) })
    get(@Req() req: AuthRequest, @Param('id') id: string) {
      return this.service.get(req.identity, key, id);
    }
    @Post()
    @Access('ADMIN')
    @ApiBody({ type: config.create })
    @ApiCreatedResponse({ schema: catalogSchema(key) })
    @ApiOperation({ summary: `Crear ${key}` })
    create(
      @Req() req: AuthRequest,
      @Body(inputDto(config.create)) dto: object,
    ) {
      return this.service.save(req.identity, key, dto, req.ip);
    }
    @Patch(':id')
    @Access('ADMIN')
    @ApiBody({ type: config.update })
    @ApiOkResponse({ schema: catalogSchema(key) })
    @ApiOperation({
      summary: `Actualizar ${key} con motivo; no elimina historial`,
    })
    update(
      @Req() req: AuthRequest,
      @Param('id') id: string,
      @Body(inputDto(config.update)) dto: object,
    ) {
      return this.service.save(req.identity, key, dto, req.ip, id);
    }
  }
  Object.defineProperty(CatalogController, 'name', {
    value: `${key}Controller`,
  });
  return CatalogController;
}
export const catalogControllers = (Object.keys(catalogs) as CatalogKey[]).map(
  catalogController,
);

@Controller('oferta/grupos')
@ApiTags('Asignación docente')
@ApiCookieAuth(COOKIE_NAME)
@Access('ADMIN')
export class AssignmentController {
  constructor(@Inject(OfferService) private readonly service: OfferService) {}
  @Get(':id/docentes')
  @ApiOkResponse({ schema: { type: 'array', items: assignmentSchema } })
  @ApiOperation({
    summary: 'Consultar asignaciones activas e históricas del grupo',
  })
  list(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.assignments(req.identity, id);
  }
  @Put(':id/docentes/:docenteId')
  @ApiOkResponse({ schema: assignmentSchema })
  @ApiBody({ type: AssignmentDto })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({
    summary: 'Asignar, modificar o inactivar la relación docente–grupo',
  })
  assign(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('docenteId') teacher: string,
    @Body(inputDto(AssignmentDto)) dto: AssignmentDto,
  ) {
    return this.service.assign(req.identity, id, teacher, dto, req.ip);
  }
}
