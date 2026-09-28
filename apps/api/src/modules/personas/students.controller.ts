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
import { pageSchema } from '../../common/http-schema.js';
import {
  StudentsService,
  studentReaders,
  studentWriters,
} from './students.service.js';
import { StudentHistoryService } from './student-history.service.js';
import { StudentDto, EditStudentDto } from './students.dto.js';
import {
  studentSchema,
  studentListSchema,
  attemptSchema,
  attemptDetailSchema,
} from './students.schema.js';

@Controller('estudiantes')
@ApiTags('Estudiantes — B06')
@ApiCookieAuth(COOKIE_NAME)
@Access(...studentReaders)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly service: StudentsService,
    @Inject(StudentHistoryService)
    private readonly history: StudentHistoryService,
  ) {}
  @Get()
  @ApiOkResponse({ schema: pageSchema(studentListSchema) })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Documento, código o nombres; coincidencia parcial literal',
  })
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'tipoDocumento', required: false })
  @ApiQuery({ name: 'numeroDocumento', required: false })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.list(req.identity, query);
  }
  @Get('documento')
  @Access(...studentWriters)
  @ApiOperation({ summary: 'Comprobar identidad antes del registro' })
  @ApiQuery({ name: 'tipoDocumento' })
  @ApiQuery({ name: 'numeroDocumento' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        encontrado: { type: 'boolean' },
        registro: {
          type: 'object',
          nullable: true,
          properties: {
            persona: studentSchema.properties!.persona,
            estudiante_id: { type: 'string', nullable: true },
            codigo_estudiante: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
  document(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.document(req.identity, query);
  }
  @Get(':id')
  @ApiOkResponse({ schema: studentSchema })
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.get(req.identity, id);
  }
  @Post()
  @Access(...studentWriters)
  @ApiBody({ type: StudentDto })
  @ApiCreatedResponse({ schema: studentSchema })
  create(@Req() req: AuthRequest, @Body(inputDto(StudentDto)) dto: StudentDto) {
    return this.service.create(req.identity, dto, req.ip);
  }
  @Patch(':id')
  @Access(...studentWriters)
  @ApiBody({ type: EditStudentDto })
  @ApiOkResponse({ schema: studentSchema })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(inputDto(EditStudentDto)) dto: EditStudentDto,
  ) {
    return this.service.update(req.identity, id, dto, req.ip);
  }
  @Get(':id/historial')
  @ApiOperation({
    summary:
      'Intentos separados por nivel y periodo; sin recalcular resultados',
  })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'nivelId', required: false })
  @ApiQuery({ name: 'periodoId', required: false })
  @ApiOkResponse({
    schema: {
      ...pageSchema(attemptSchema),
      properties: {
        ...pageSchema(attemptSchema).properties,
        opciones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nivel_id: { type: 'string' },
              nivel: { type: 'string' },
              idioma: { type: 'string' },
              periodo_id: { type: 'string' },
              periodo: { type: 'string' },
            },
          },
        },
      },
    },
  })
  listHistory(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.history.list(req.identity, id, query);
  }
  @Get(':id/historial/:attemptId')
  @ApiOkResponse({ schema: attemptDetailSchema })
  attempt(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('attemptId') attempt: string,
  ) {
    return this.history.attempt(req.identity, id, attempt);
  }
}
