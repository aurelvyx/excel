import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/usuarios/users.module.js';
import { OfferModule } from './modules/oferta-academica/offer.module.js';
import { PersonasModule } from './modules/personas/personas.module.js';
import { MatriculasModule } from './modules/matriculas/matriculas.module.js';
import { AsistenciaModule } from './modules/asistencia/asistencia.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    OfferModule,
    PersonasModule,
    MatriculasModule,
    AsistenciaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
