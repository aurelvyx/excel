import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  IdField,
  NullableField,
  OptionalField,
  TextField,
} from '../../common/validation.js';
import { PersonDto, EditPersonDto } from './person.dto.js';
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
