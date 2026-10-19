import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsUUID } from 'class-validator';
import { IdField, OptionalField } from '../../common/validation.js';
export class EnrollmentDto {
  @IdField() estudianteId!: string;
  @IdField() grupoId!: string;
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Clave del asistente para reintentar el alta sin crear otro intento',
  })
  @OptionalField()
  @IsUUID('4')
  claveSolicitud?: string;
}
export class ActivationDto {
  @IdField() voucherId!: string;
  @ApiProperty({
    type: Boolean,
    enum: [true],
    description: 'Confirmación explícita de la matrícula de nivel completo',
  })
  @Equals(true)
  confirmado!: true;
}
