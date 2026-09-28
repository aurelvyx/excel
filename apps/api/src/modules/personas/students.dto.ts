import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsObject,
  Matches,
  ValidateNested,
} from 'class-validator';
import { IdField, OptionalField, TextField } from '../../common/validation.js';
import { PersonDto, EditPersonDto } from './person.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class StudentPersonDto extends PersonDto {
  @Transform(trim) @TextField(20) declare tipoDocumento: string;
  @Transform(trim) @TextField(25) declare numeroDocumento: string;
}
export class StudentDto {
  @ApiPropertyOptional({ type: String })
  @OptionalField()
  @IdField()
  personaId?: string;
  @ApiPropertyOptional({ type: StudentPersonDto })
  @OptionalField()
  @IsObject()
  @ValidateNested()
  @Type(() => StudentPersonDto)
  persona?: StudentPersonDto;
  @Transform(trim) @TextField(30) codigoEstudiante!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaRegistro!: string;
}
export class EditStudentDto {
  @ApiPropertyOptional({ type: EditPersonDto })
  @OptionalField()
  @IsObject()
  @ValidateNested()
  @Type(() => EditPersonDto)
  persona?: EditPersonDto;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
  @TextField(500) motivo!: string;
}
