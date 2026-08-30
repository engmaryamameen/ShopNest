import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [PromotionsModule],
  providers: [CartService],
  controllers: [CartController],
  exports: [CartService],
})
export class CartModule {}
