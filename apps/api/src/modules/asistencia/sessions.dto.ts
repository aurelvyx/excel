import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsString,
  Matches,
} from 'class-validator';
import { OptionalField } from '../../common/validation.js';

export class ScheduleSessionsDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
    description: 'Fechas de clase YYYY-MM-DD, dentro del periodo académico',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique({ message: 'Las fechas de clase deben ser distintas' })
  @IsDateString({ strict: true }, { each: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/, { each: true })
  fechas!: string[];

  @ApiPropertyOptional({
    type: String,
    example: '09:00',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
    description: 'Horario opcional común al lote; indicar ambas horas',
  })
  @OptionalField()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaInicio?: string;

  @ApiPropertyOptional({
    type: String,
    example: '11:00',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
  })
  @OptionalField()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaFin?: string;
}
