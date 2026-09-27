import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsDateString,
  IsEmail,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  IdField,
  NullableField,
  OptionalField,
  TextField,
} from '../../common/validation.js';

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
export class TeacherDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Usar una persona existente o enviar persona, nunca ambos',
  })
  @OptionalField()
  @IdField()
  personaId?: string;
  @ApiPropertyOptional({ type: PersonDto })
  @OptionalField()
  @ValidateNested()
  @IsObject()
  @Type(() => PersonDto)
  persona?: PersonDto;
  @TextField(30) codigoDocente!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Length(1, 120)
  especialidad?: string | null;
}
export class EditTeacherDto {
  @ApiPropertyOptional({ type: String })
  @OptionalField()
  @TextField(30)
  codigoDocente?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Length(1, 120)
  especialidad?: string | null;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
  @ApiPropertyOptional({ type: EditPersonDto })
  @OptionalField()
  @ValidateNested()
  @IsObject()
  @Type(() => EditPersonDto)
  persona?: EditPersonDto;
  @ApiProperty({ type: String }) @TextField(500) motivo!: string;
}
