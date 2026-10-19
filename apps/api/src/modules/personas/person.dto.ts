import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { NullableField, TextField } from '../../common/validation.js';
export class PersonDto {
  @TextField(20) tipoDocumento!: string;
  @TextField(25) numeroDocumento!: string;
  @TextField(100) nombres!: string;
  @TextField(80) apellidoPaterno!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  apellidoMaterno?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' })
  @NullableField()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaNacimiento?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Length(1, 25)
  telefono?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsEmail()
  @Length(1, 150)
  correo?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Length(1, 250)
  direccion?: string | null;
}
export class EditPersonDto extends PartialType(
  OmitType(PersonDto, ['tipoDocumento', 'numeroDocumento'] as const),
  { skipNullProperties: false },
) {}
