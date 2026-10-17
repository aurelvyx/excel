import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import { reportTypes, type ReportType } from './report.model.js';

export { type ReportType } from './report.model.js';

export class ExportReportDto {
  @ApiProperty({ enum: reportTypes })
  @IsIn(reportTypes)
  tipo!: ReportType;

  @ApiProperty({ type: String, pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
}
