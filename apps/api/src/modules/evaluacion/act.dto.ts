import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IdField, NullableField, TextField } from '../../common/validation.js';

export class CloseActDto {
  @ApiProperty({ type: String, pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 400 })
  @NullableField()
  @IsString()
  @MaxLength(400)
  motivo?: string | null;
}

class ActCorrectionDto {
  @IdField() cierreId!: string;
  @IdField() matriculaId!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  resultadoVersion!: number;
  @TextField(400) motivo!: string;
}
export class CorrectActGradeDto extends ActCorrectionDto {
  @IdField() calificacionId!: string;
  @ApiProperty({ type: String, description: '0 a 20; hasta dos decimales' })
  @IsString()
  @Matches(/^(?:0|[1-9]|1[0-9]|20)(?:\.\d{1,2})?$/)
  nota!: string;
}
export class CorrectActAttendanceDto extends ActCorrectionDto {
  @IdField() sesionId!: string;
  @ApiProperty({ enum: ['P', 'F', 'T', 'J'] })
  @IsIn(['P', 'F', 'T', 'J'])
  codigo!: 'P' | 'F' | 'T' | 'J';
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 250 })
  @NullableField()
  @IsString()
  @MaxLength(250)
  observacion?: string | null;
}
