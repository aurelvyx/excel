import { ApiProperty } from '@nestjs/swagger';
import { ROLE_CODES, type Role } from './access.js';

export class IdentityDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) nombre_usuario!: string;
  @ApiProperty({ type: Boolean }) requiere_cambio_clave!: boolean;
  @ApiProperty({ enum: ROLE_CODES, isArray: true }) roles!: Role[];
}
export class SessionDto {
  @ApiProperty({ type: IdentityDto }) user!: IdentityDto;
  @ApiProperty({
    type: String,
    description: 'Enviar como X-CSRF-Token en escrituras autenticadas',
  })
  csrfToken!: string;
}
export class UserDto extends IdentityDto {
  @ApiProperty({ type: String, nullable: true }) persona_id!: string | null;
  @ApiProperty({ type: Boolean }) activo!: boolean;
}
export class UserPageDto {
  @ApiProperty({ type: [UserDto] }) items!: UserDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
