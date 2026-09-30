import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/usuarios/users.module.js';
import { OfferModule } from './modules/oferta-academica/offer.module.js';
import { PersonasModule } from './modules/personas/personas.module.js';
import { MatriculasModule } from './modules/matriculas/matriculas.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, OfferModule, PersonasModule, MatriculasModule],
  controllers: [HealthController],
})
export class AppModule {}
