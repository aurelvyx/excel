import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { ApiErrorFilter } from './common/filtros/api-error.filter.js';
import { COOKIE_NAME } from './modules/auth/security.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalFilters(new ApiErrorFilter());
  const config = new DocumentBuilder()
    .setTitle('Centro de Idiomas Excel')
    .setDescription(
      'B03–B06: acceso, usuarios, oferta académica, docentes, estudiantes, historial y auditoría. Cookie de sesión, Origin y CSRF para escrituras.',
    )
    .addCookieAuth(COOKIE_NAME, { type: 'apiKey', in: 'cookie' }, COOKIE_NAME)
    .setVersion('0.4.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    () => SwaggerModule.createDocument(app, config),
    {
      jsonDocumentUrl: 'api/openapi.json',
    },
  );
}
