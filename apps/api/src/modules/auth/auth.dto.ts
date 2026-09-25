import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({ type: String, example: 'administrador' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,60}$/)
  nombreUsuario!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ type: String, format: 'password' })
  @IsString()
  @Length(1, 128)
  passwordActual!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @Length(12, 128)
  @Matches(/\S/)
  passwordNueva!: string;
}
