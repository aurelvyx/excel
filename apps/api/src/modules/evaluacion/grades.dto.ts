import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IdField } from '../../common/validation.js';

export class GradeEntryDto {
  @IdField() matriculaId!: string;
  @IdField() indicadorId!: string;
  @ApiProperty({
    type: String,
    pattern: '^(?:0|[1-9]|1[0-9]|20)(?:\\.[0-9]{1,2})?$',
    description:
      'Nota de 0 a 20, hasta dos decimales; pendiente no equivale a cero',
  })
  @IsString()
  @Matches(/^(?:0|[1-9]|1[0-9]|20)(?:\.\d{1,2})?$/)
  nota!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
    description: 'null para alta; versión consultada para editar',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number | null;
}
export class SaveGradesDto {
  @ApiProperty({ type: [GradeEntryDto], minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ArrayUnique(
    (row: GradeEntryDto) => `${row?.matriculaId}/${row?.indicadorId}`,
    { message: 'No repita matrícula e indicador en el lote' },
  )
  @ValidateNested({ each: true })
  @Type(() => GradeEntryDto)
  registros!: GradeEntryDto[];
}
