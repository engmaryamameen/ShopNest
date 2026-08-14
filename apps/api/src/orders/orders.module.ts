import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [CartModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  // VendorOrdersService (vendor module) reuses recomputeOrderStatus() after
  // moving a single VendorOrder — same aggregation rule, one
  // implementation.
  exports: [OrdersService],
})
export class OrdersModule {}
