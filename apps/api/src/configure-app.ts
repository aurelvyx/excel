import {
  BadRequestException,
  PayloadTooLargeException,
  type INestApplication,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { ApiErrorFilter } from './common/filtros/api-error.filter.js';
import { COOKIE_NAME } from './modules/auth/security.js';

export function configureApp(app: INestApplication): void {
  // Una página puede capturar 20 matrículas por hasta 100 indicadores aprobados.
  (app as NestExpressApplication).useBodyParser('json', { limit: '512kb' });
  // Sanitizar antes de que el adaptador convierta SyntaxError y pierda el tipo del parser.
  app.use(
    (error: unknown, _req: Request, _res: Response, next: NextFunction) => {
      const type = (error as { type?: string })?.type;
      next(
        type === 'entity.parse.failed'
          ? new BadRequestException('El cuerpo JSON no es válido')
          : type === 'entity.too.large'
            ? new PayloadTooLargeException(
                'La solicitud supera el tamaño máximo permitido',
              )
            : error,
      );
    },
  );
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
      'B03–B17: acceso, usuarios, oferta académica, estudiantes, vouchers, matrículas, sesiones, asistencia, justificaciones, cierre, correcciones, criterios aprobados y notas abiertas con promedio exacto y auditoría. Cookie de sesión, Origin y CSRF para escrituras.',
    )
    .addCookieAuth(COOKIE_NAME, { type: 'apiKey', in: 'cookie' }, COOKIE_NAME)
    .setVersion('0.17.0')
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
