import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IdField, NullableField } from '../../common/validation.js';

export class AttendanceEntryDto {
  @IdField() matriculaId!: string;
  @ApiProperty({ enum: ['P', 'F', 'T', 'J'] })
  @IsIn(['P', 'F', 'T', 'J'])
  codigo!: 'P' | 'F' | 'T' | 'J';
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 250,
    description: 'Omitir conserva el comentario; null lo borra',
  })
  @NullableField()
  @IsString()
  @MaxLength(250)
  observacion?: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
    description: 'null para alta; versión leída para corregir',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number | null;
}
export class SaveAttendanceDto {
  @ApiProperty({ type: [AttendanceEntryDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((row: AttendanceEntryDto) => row?.matriculaId, {
    message: 'No repita una matrícula en el lote',
  })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  registros!: AttendanceEntryDto[];
}
