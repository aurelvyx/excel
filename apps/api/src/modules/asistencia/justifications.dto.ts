import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IdField, NullableField, TextField } from '../../common/validation.js';

export class CreateJustificationDto {
  @IdField() asistenciaId!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  asistenciaVersion!: number;
  @TextField(500) motivo!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fechaPresentacion!: string;
}
class JustificationVersionDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}
export class ResolveJustificationDto extends JustificationVersionDto {
  @ApiProperty({ enum: ['APROBADA', 'RECHAZADA'] })
  @IsIn(['APROBADA', 'RECHAZADA'])
  estado!: 'APROBADA' | 'RECHAZADA';
  @TextField(300) observacion!: string;
}
export class RecoverJustificationDto extends JustificationVersionDto {
  @ApiProperty({ enum: ['RECUPERADA', 'NO_RECUPERADA'] })
  @IsIn(['RECUPERADA', 'NO_RECUPERADA'])
  estado!: 'RECUPERADA' | 'NO_RECUPERADA';
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @NullableField()
  @IsString()
  @MaxLength(300)
  observacion?: string | null;
}
