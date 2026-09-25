import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  ValidationPipe,
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
import { UsersService } from './users.service.js';
import { AssignRolesDto, CreateUserDto, UpdateUserDto } from './users.dto.js';
import { UserDto, UserPageDto } from '../auth/response.dto.js';

const input = (
  expectedType:
    typeof AssignRolesDto | typeof CreateUserDto | typeof UpdateUserDto,
) =>
  new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
function userId(id: string) {
  if (!/^[1-9][0-9]{0,17}$/.test(id))
    throw new BadRequestException('ID de usuario inválido');
  return id;
}

@ApiTags('Usuarios y roles')
@ApiCookieAuth(COOKIE_NAME)
@ApiHeader({
  name: 'X-CSRF-Token',
  description: 'Requerido para escrituras',
  required: false,
})
@Access('ADMIN')
@Controller('usuarios')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios; solo administrador, hasta 100 por página',
  })
  @ApiOkResponse({ type: UserPageDto })
  @ApiQuery({ name: 'after', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Req() req: AuthRequest,
    @Query('after') after = '0',
    @Query('limit') limit = '50',
  ) {
    return this.users.list(req.identity, after, Number(limit));
  }

  @Get('roles')
  @ApiOperation({ summary: 'Consultar roles activos asignables' })
  roles(@Req() req: AuthRequest) {
    return this.users.roles(req.identity);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear usuario y asignar roles con contraseña temporal',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ type: UserDto })
  create(
    @Req() req: AuthRequest,
    @Body(input(CreateUserDto)) dto: CreateUserDto,
  ) {
    return this.users.create(req.identity, dto, req.ip);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar o activar/inactivar usuario; revoca sus sesiones',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserDto })
  update(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body(input(UpdateUserDto)) dto: UpdateUserDto,
  ) {
    return this.users.update(req.identity, userId(id), dto, req.ip);
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Reemplazar roles y revocar sesiones del usuario' })
  @ApiBody({ type: AssignRolesDto })
  @ApiOkResponse({ type: UserDto })
  rolesUpdate(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body(input(AssignRolesDto)) dto: AssignRolesDto,
  ) {
    return this.users.assignRoles(req.identity, userId(id), dto, req.ip);
  }
}
