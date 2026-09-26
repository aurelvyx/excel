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
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { TeachersService } from './teachers.service.js';
import { EditTeacherDto, TeacherDto } from './teachers.dto.js';
import { teacherSchema, teacherListSchema } from './teachers.schema.js';
import { pageSchema } from '../../common/http-schema.js';

@Controller('docentes')
@ApiTags('Docentes')
@ApiCookieAuth(COOKIE_NAME)
@Access('ADMIN')
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class TeachersController {
  constructor(
    @Inject(TeachersService) private readonly service: TeachersService,
  ) {}
  @Get()
  @ApiOkResponse({ schema: pageSchema(teacherListSchema) })
  @ApiQuery({ name: 'after', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'activo',
    required: false,
    type: String,
    enum: ['true', 'false'],
  })
  @ApiQuery({ name: 'tipoDocumento', required: false, type: String })
  @ApiQuery({ name: 'numeroDocumento', required: false, type: String })
  @ApiOperation({
    summary:
      'Listar docentes; filtros activo y documento, paginación after/limit',
  })
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.list(req.identity, query);
  }
  @Get(':id')
  @ApiOkResponse({ schema: teacherSchema })
  @ApiOperation({
    summary: 'Consultar el perfil y datos personales de un docente',
  })
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.get(req.identity, id);
  }
  @Post()
  @ApiCreatedResponse({ schema: teacherSchema })
  @ApiBody({ type: TeacherDto })
  @ApiOperation({
    summary: 'Crear docente con persona nueva o vincular una existente',
  })
  create(@Req() req: AuthRequest, @Body(inputDto(TeacherDto)) dto: TeacherDto) {
    return this.service.create(req.identity, dto, req.ip);
  }
  @Patch(':id')
  @ApiOkResponse({ schema: teacherSchema })
  @ApiBody({ type: EditTeacherDto })
  @ApiOperation({
    summary:
      'Editar o inactivar docente conservando su identidad y asignaciones',
  })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(inputDto(EditTeacherDto)) dto: EditTeacherDto,
  ) {
    return this.service.update(req.identity, id, dto, req.ip);
  }
}
