import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { OptionalJwtAuthGuard } from './auth/guards/optional-jwt-auth.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RolesGuard } from './common/guards/roles.guard';
import appConfig from './config/app.config';
import { validate } from './config/env.validation';
import { CatalogImportModule } from './catalog-import/catalog-import.module';
import { LocationModule } from './location/location.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { VendorModule } from './vendor/vendor.module';
import { AdminModule } from './admin/admin.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { AddressesModule } from './addresses/addresses.module';
import { PaymentModule } from './payment/payment.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ReturnsModule } from './returns/returns.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      cache: true,
      validate,
    }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          transport:
            process.env.NODE_ENV !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.body.password',
              'req.body.passwordHash',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: {
            ignore: (req) => req.url === '/health',
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('app.throttleTtlMs', 60_000),
            limit: config.get<number>('app.throttleLimit', 120),
          },
        ],
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    HealthModule,
    AuditModule,
    MailModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    VendorModule,
    CatalogImportModule,
    LocationModule,
    AdminModule,
    ReviewsModule,
    WishlistModule,
    AddressesModule,
    PaymentModule,
    PromotionsModule,
    ReturnsModule,
  ],
  providers: [
    // Guard execution order: 1 → 2 → 3 → 4 (then controller/route guards)
    // 1. Reject requests over the per-IP rate limit before any other work
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 2. Populate request.user from JWT cookie if present (never throws)
    { provide: APP_GUARD, useClass: OptionalJwtAuthGuard },
    // 3. Reject mutating requests whose Origin doesn't match WEB_URL
    { provide: APP_GUARD, useClass: OriginGuard },
    // 4. Enforce @Roles() metadata — request.user is already set by step 2
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
