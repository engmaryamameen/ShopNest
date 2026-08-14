import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

/**
 * Builds and fully configures the Nest application (middleware, pipes,
 * filters, interceptors, CORS) without starting an HTTP listener or mounting
 * Swagger. Shared by the production `bootstrap()` below and by
 * `test/concurrency.integration.spec.ts`, which boots the real app in-process
 * against an ephemeral port instead of depending on a separately-running
 * server — one source of truth for "what does a real ShopNest app instance
 * look like" instead of a second, drifting copy in test code.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  const webUrl = config.get<string>('WEB_URL', 'http://localhost:3000');

  app.useLogger(app.get(Logger));

  // Serves whatever LocalMediaStorageAdapter writes — same directory,
  // same config key, so the two never drift apart.
  app.useStaticAssets(join(process.cwd(), config.get<string>('app.mediaUploadDir', 'uploads')), {
    prefix: '/uploads',
  });

  // CSP off — this app serves JSON, not HTML, except the Swagger docs
  // page (an internal dev tool), whose inline scripts a default CSP would
  // block. Every other helmet header (HSTS, X-Content-Type-Options,
  // X-Frame-Options, etc.) stays on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: webUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ShopNest API')
    .setDescription('Production-grade e-commerce REST API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`API listening on port ${port}`);
}

// Only auto-start the server when this file is the process entrypoint — not
// when it's imported (e.g. by the integration test suite, which calls
// `createApp()` directly and manages its own listen/close lifecycle).
if (require.main === module) {
  bootstrap();
}
