import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import {
  loadEnvironment,
  positiveInteger,
} from './database/configuracion/environment.js';
import { trustedProxyHops } from './common/proxy.js';

async function bootstrap() {
  loadEnvironment();
  const proxyHops = trustedProxyHops(process.env.TRUST_PROXY_HOPS);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', proxyHops);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(
    positiveInteger(process.env.PORT, 3000, 'PORT'),
    process.env.HOST || '127.0.0.1',
  );
}
await bootstrap();
