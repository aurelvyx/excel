import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { loadEnvironment, positiveInteger } from './database/configuracion/environment.js';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(positiveInteger(process.env.PORT, 3000, 'PORT'), '127.0.0.1');
}
await bootstrap();
