import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';
import { IdField } from '../../common/validation.js';
export class EnrollmentDto {
  @IdField() estudianteId!: string;
  @IdField() grupoId!: string;
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
