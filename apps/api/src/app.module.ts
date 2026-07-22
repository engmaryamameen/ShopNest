import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      cache: true,
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
    PrismaModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    CartModule,
    OrdersModule,
  ],
  providers: [
    // Guard execution order: 1 → 2 → 3 (then controller/route guards)
    // 1. Populate request.user from JWT cookie if present (never throws)
    { provide: APP_GUARD, useClass: OptionalJwtAuthGuard },
    // 2. Reject mutating requests whose Origin doesn't match WEB_URL
    { provide: APP_GUARD, useClass: OriginGuard },
    // 3. Enforce @Roles() metadata — request.user is already set by step 1
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
