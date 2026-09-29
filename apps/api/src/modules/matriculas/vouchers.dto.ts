import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IdField, OptionalField, TextField } from '../../common/validation.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class VoucherDto {
  @IdField() estudianteId!: string;
  @Transform(trim) @TextField(60) numero!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaPago!: string;
  @ApiProperty({
    type: String,
    pattern: '^\\d{1,8}(\\.\\d{1,2})?$',
    example: '100.50',
    description:
      'Importe positivo y exacto; máximo 99999999.99. No enviar número JSON.',
  })
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  importe!: string;
}
export class VoucherDecisionDto {
  @ApiProperty({ enum: ['VALIDADO', 'RECHAZADO'] })
  @IsIn(['VALIDADO', 'RECHAZADO'])
  estado!: 'VALIDADO' | 'RECHAZADO';
  @ApiPropertyOptional({
    type: String,
    maxLength: 300,
    description: 'Obligatoria para rechazar',
  })
  @OptionalField()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  observacion?: string;
}
