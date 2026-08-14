import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OrdersModule } from '../orders/orders.module';
import { VendorMembershipService } from './vendor-membership.service';
import { VendorOnboardingService } from './vendor-onboarding.service';
import { VendorOnboardingController, AdminVendorController } from './vendor-onboarding.controller';
import { VendorOffersService } from './vendor-offers.service';
import { VendorOffersController } from './vendor-offers.controller';
import { VendorOrdersService } from './vendor-orders.service';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorStaffService } from './vendor-staff.service';
import { VendorStaffController } from './vendor-staff.controller';
import { VendorAnalyticsService } from './vendor-analytics.service';

@Module({
  imports: [MailModule, OrdersModule],
  controllers: [
    VendorOnboardingController,
    AdminVendorController,
    VendorOffersController,
    VendorOrdersController,
    VendorStaffController,
  ],
  providers: [
    VendorMembershipService,
    VendorOnboardingService,
    VendorOffersService,
    VendorOrdersService,
    VendorStaffService,
    VendorAnalyticsService,
  ],
})
export class VendorModule {}
