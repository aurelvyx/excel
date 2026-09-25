import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../modules/auth/access.js';

@ApiTags('Salud técnica')
@Controller('health')
@Public()
export class HealthController {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Disponibilidad de la API y PostgreSQL; no expone datos académicos' })
  @ApiResponse({ status: 200, description: 'API y PostgreSQL disponibles' })
  @ApiResponse({ status: 503, description: 'PostgreSQL no disponible' })
  async health(): Promise<{ status: string; database: string }> {
    try {
      await this.source.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }
}
