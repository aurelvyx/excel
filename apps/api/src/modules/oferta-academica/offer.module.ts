import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import {
  catalogControllers,
  AssignmentController,
} from './offer.controller.js';
import { OfferService } from './offer.service.js';
import { OfferRepository } from './offer.repository.js';

@Module({
  imports: [ControlModule],
  controllers: [...catalogControllers, AssignmentController],
  providers: [OfferService, OfferRepository],
})
export class OfferModule {}
