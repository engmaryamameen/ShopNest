import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  refreshGracePeriodMs: parseInt(process.env.REFRESH_GRACE_PERIOD_MS ?? '30000', 10),
  cartMaxQuantityPerProduct: parseInt(process.env.CART_MAX_QTY_PER_PRODUCT ?? '10', 10),
  catalogImportUrl: process.env.CATALOG_IMPORT_URL ?? 'https://dummyjson.com',
  catalogImportTimeoutMs: parseInt(process.env.CATALOG_IMPORT_TIMEOUT_MS ?? '5000', 10),
  catalogWorkerEnabled: process.env.CATALOG_WORKER_ENABLED !== 'false',
  catalogWorkerPollMs: parseInt(process.env.CATALOG_WORKER_POLL_MS ?? '2000', 10),
  catalogWorkerLeaseSeconds: parseInt(process.env.CATALOG_WORKER_LEASE_SECONDS ?? '300', 10),
  catalogScheduleEnabled: process.env.CATALOG_SCHEDULE_ENABLED !== 'false',
  catalogScheduleIntervalMs: parseInt(process.env.CATALOG_SCHEDULE_INTERVAL_MS ?? '21600000', 10),
  geocodingUrl: process.env.GEOCODING_URL ?? 'https://nominatim.openstreetmap.org',
  geocodingTimeoutMs: parseInt(process.env.GEOCODING_TIMEOUT_MS ?? '5000', 10),
}));
