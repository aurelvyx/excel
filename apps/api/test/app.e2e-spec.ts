import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HealthController } from '../src/health/health.controller.js';
import { configureApp } from '../src/configure-app.js';

describe('Contrato técnico B01', () => {
  let app: INestApplication;
  const query = vi.fn();
  beforeEach(async () => {
    query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: { query } }],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('expone salud bajo /api/v1', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200)
      .expect({ status: 'ok', database: 'up' });
  });
  it('responde 503 sin revelar credenciales ni errores SQL', async () => {
    query.mockRejectedValue(new Error('password=never-expose-this'));
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(JSON.stringify(response.body)).not.toContain('never-expose-this');
  });
  it('publica OpenAPI y no expone rutas académicas', async () => {
    const response = await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    expect(Object.keys(response.body.paths)).toEqual(['/api/v1/health']);
    await request(app.getHttpServer()).get('/api/v1/estudiantes').expect(404);
  });
});
