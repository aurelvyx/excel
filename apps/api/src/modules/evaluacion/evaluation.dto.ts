import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IdField, TextField } from '../../common/validation.js';

class WeightedEntryDto {
  @ApiProperty({
    type: String,
    description: 'Porcentaje positivo hasta 100, máximo dos decimales',
  })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/)
  pesoPct!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 32767 })
  @IsInt()
  @Min(1)
  @Max(32767)
  orden!: number;
}
export class EvaluationIndicatorDto extends WeightedEntryDto {
  @TextField(20) codigo!: string;
  @TextField(250) descripcion!: string;
}
export class EvaluationComponentDto extends WeightedEntryDto {
  @TextField(120) nombre!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Unidad del mismo nivel o null',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(/^[1-9][0-9]{0,17}$/)
  unidadId!: string | null;
  @ApiProperty({ type: [EvaluationIndicatorDto], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EvaluationIndicatorDto)
  indicadores!: EvaluationIndicatorDto[];
}
export class EvaluationDefinitionDto {
  @ApiProperty({ type: [EvaluationComponentDto], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EvaluationComponentDto)
  evaluaciones!: EvaluationComponentDto[];
}
export class CreateEvaluationPlanDto {
  @TextField(120) nombre!: string;
  @ApiProperty({ enum: ['PONDERADA_JERARQUICA_V1'] })
  @IsIn(['PONDERADA_JERARQUICA_V1'])
  formula!: 'PONDERADA_JERARQUICA_V1';
  @ApiProperty({ type: EvaluationDefinitionDto })
  @ValidateNested()
  @Type(() => EvaluationDefinitionDto)
  estructura!: EvaluationDefinitionDto;
}
export class EvaluationRevisionDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  revision!: number;
}
export class UpdateEvaluationPlanDto extends CreateEvaluationPlanDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  revision!: number;
}
export class ApproveEvaluationPlanDto extends EvaluationRevisionDto {
  @TextField(400) referenciaAprobacion!: string;
  @ApiProperty({
    type: Boolean,
    enum: [true],
    description: 'Confirma aprobación institucional de fórmula y pesos',
  })
  @Equals(true)
  confirmado!: true;
}
export class ApplyEvaluationPlanDto {
  @IdField() planId!: string;
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  confirmado!: true;
}
