import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { AdminPromotionsController } from './promotions.controller';

@Module({
  controllers: [AdminPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
