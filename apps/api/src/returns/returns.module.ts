import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { ReturnsService } from './returns.service';
import { OrderReturnsController } from './order-returns.controller';
import { AdminReturnsController } from './admin-returns.controller';

@Module({
  imports: [PaymentModule],
  controllers: [OrderReturnsController, AdminReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
