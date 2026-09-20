import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CartModule } from '../cart/cart.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [CartModule, PromotionsModule, PaymentModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  // VendorOrdersService (vendor module) reuses recomputeOrderStatus() after
  // moving a single VendorOrder — same aggregation rule, one
  // implementation.
  exports: [OrdersService],
})
export class OrdersModule {}
