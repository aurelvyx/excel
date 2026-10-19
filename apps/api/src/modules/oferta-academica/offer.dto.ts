import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  IdField,
  NullableField,
  OptionalField,
  TextField,
} from '../../common/validation.js';

export class LanguageDto {
  @TextField(15) codigo!: string;
  @TextField(80) nombre!: string;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
}
export class LevelDto {
  @IdField() idiomaId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @NullableField()
  @IsString()
  @Matches(/^[1-9][0-9]{0,17}$/)
  prerrequisitoId?: string | null;
  @TextField(20) codigo!: string;
  @TextField(100) nombre!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 32767 })
  @IsInt()
  @Min(1)
  @Max(32767)
  orden!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @NullableField()
  @IsInt()
  @Min(1)
  @Max(32767)
  duracionMeses?: number | null;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
}
export class UnitDto {
  @IdField() nivelId!: string;
  @TextField(20) codigo!: string;
  @TextField(120) nombre!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '1.5',
    description: 'Decimal exacto de 0 a 999.9; máximo un decimal',
  })
  @NullableField()
  @IsString()
  @Matches(/^(0|[1-9][0-9]{0,2})(\.[0-9])?$/)
  creditos?: string | null;
  @ApiProperty({ type: Number, minimum: 0, maximum: 32767 })
  @IsInt()
  @Min(0)
  @Max(32767)
  horasTeoricas!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 32767 })
  @IsInt()
  @Min(0)
  @Max(32767)
  horasPracticas!: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 32767 })
  @IsInt()
  @Min(1)
  @Max(32767)
  orden!: number;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
}
export class PeriodDto {
  @TextField(20) codigo!: string;
  @TextField(100) nombre!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaInicio!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaFin!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  matriculaInicio!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  matriculaFin!: string;
  @ApiPropertyOptional({ enum: ['PLANIFICADO', 'ABIERTO', 'CERRADO'] })
  @OptionalField()
  @IsIn(['PLANIFICADO', 'ABIERTO', 'CERRADO'])
  estado?: string;
}
export class ShiftDto {
  @TextField(50) nombre!: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: '09:00' })
  @NullableField()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  horaInicio?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '11:00' })
  @NullableField()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  horaFin?: string | null;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
}
export class SectionDto {
  @TextField(15) codigo!: string;
  @TextField(60) nombre!: string;
  @ApiPropertyOptional({ type: Boolean })
  @OptionalField()
  @IsBoolean()
  activo?: boolean;
}
export class GroupDto {
  @IdField() periodoId!: string;
  @IdField() nivelId!: string;
  @IdField() turnoId!: string;
  @IdField() seccionId!: string;
  @TextField(30) codigo!: string;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @NullableField()
  @IsInt()
  @Min(1)
  @Max(32767)
  capacidad?: number | null;
  @ApiPropertyOptional({ enum: ['PLANIFICADO', 'ACTIVO', 'CERRADO'] })
  @OptionalField()
  @IsIn(['PLANIFICADO', 'ACTIVO', 'CERRADO'])
  estado?: string;
}
export class UpdateLanguageDto extends PartialType(LanguageDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdateLevelDto extends PartialType(LevelDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdateUnitDto extends PartialType(UnitDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdatePeriodDto extends PartialType(PeriodDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdateShiftDto extends PartialType(ShiftDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdateSectionDto extends PartialType(SectionDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class UpdateGroupDto extends PartialType(GroupDto, {
  skipNullProperties: false,
}) {
  @TextField(500) motivo!: string;
}
export class AssignmentDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() esTitular!: boolean;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaAsignacion!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() activo!: boolean;
  @TextField(500) motivo!: string;
}
