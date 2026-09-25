import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';

@Module({
  imports: [TypeOrmModule.forRootAsync({
    useFactory: () => {
      loadEnvironment();
      return { ...databaseOptions(), retryAttempts: 1 };
    },
  })],
})
export class DatabaseModule {}
