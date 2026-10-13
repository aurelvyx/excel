import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches, MaxLength } from 'class-validator';
import { IdField, NullableField, TextField } from '../../common/validation.js';
import { AttendanceEntryDto } from './attendance.dto.js';

export class CloseAttendanceDto {
  @ApiProperty({
    type: String,
    pattern: '^[a-f0-9]{64}$',
    description: 'Revisión recibida en la consulta previa del grupo completo',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 400 })
  @NullableField()
  @IsString()
  @MaxLength(400)
  motivo?: string | null;
  @ApiProperty({
    type: Boolean,
    description:
      'Debe ser true si la revisión contiene pendientes o sesiones excluidas',
  })
  @IsBoolean()
  confirmarPendientes!: boolean;
}

export class CorrectAttendanceDto extends AttendanceEntryDto {
  @TextField(400) motivo!: string;
  @IdField() cierreId!: string;
}
