import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ROLE_CODES, type Role } from '../auth/access.js';

export class CreateUserDto {
  @ApiProperty({ type: String, example: 'docente.prueba' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,60}$/)
  nombreUsuario!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @Length(12, 128)
  @Matches(/\S/)
  passwordTemporal!: string;

  @ApiPropertyOptional({
    type: String,
    description: 'ID de una persona existente; cadena BIGINT',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[1-9][0-9]{0,17}$/)
  personaId?: string;

  @ApiProperty({ enum: ROLE_CODES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(ROLE_CODES, { each: true })
  roles!: Role[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,60}$/)
  nombreUsuario?: string;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Persona existente; null desvincula el perfil',
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(/^[1-9][0-9]{0,17}$/)
  personaId?: string | null;

  @ApiProperty({ type: String, description: 'Motivo de la modificación' })
  @IsString()
  @Length(3, 500)
  @Matches(/\S/)
  motivo!: string;
}

export class AssignRolesDto {
  @ApiProperty({ enum: ROLE_CODES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(ROLE_CODES, { each: true })
  roles!: Role[];

  @ApiProperty({ type: String })
  @IsString()
  @Length(3, 500)
  @Matches(/\S/)
  motivo!: string;
}
