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
  catalogImportBatchSize: parseInt(process.env.CATALOG_IMPORT_BATCH_SIZE ?? '25', 10),
  catalogScheduleEnabled: process.env.CATALOG_SCHEDULE_ENABLED !== 'false',
  catalogScheduleIntervalMs: parseInt(process.env.CATALOG_SCHEDULE_INTERVAL_MS ?? '21600000', 10),
  // Open Food Facts — open, keyless, real (see OpenFoodFactsAdapter). No
  // pricing data; imports from this source land as DRAFT/offer-less
  // products for an admin to price and publish.
  openFoodFactsUrl: process.env.OPEN_FOOD_FACTS_URL ?? 'https://world.openfoodfacts.org',
  openFoodFactsTimeoutMs: parseInt(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS ?? '8000', 10),
  openFoodFactsPageSize: parseInt(process.env.OPEN_FOOD_FACTS_PAGE_SIZE ?? '100', 10),
  // Amazon Reviews 2023 (McAuley Lab) per-category metadata files, hosted
  // on Hugging Face — open, keyless. No search API and no price/stock for
  // most records; AmazonAdapter streams each category file and stops
  // early once amazonPerCategoryLimit real records are collected, rather
  // than downloading a full file (each can run 100MB+).
  amazonBaseUrl:
    process.env.AMAZON_CATALOG_URL ??
    'https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories',
  amazonTimeoutMs: parseInt(process.env.AMAZON_CATALOG_TIMEOUT_MS ?? '20000', 10),
  amazonPerCategoryLimit: parseInt(process.env.AMAZON_CATALOG_PER_CATEGORY_LIMIT ?? '150', 10),
  geocodingUrl: process.env.GEOCODING_URL ?? 'https://nominatim.openstreetmap.org',
  geocodingTimeoutMs: parseInt(process.env.GEOCODING_TIMEOUT_MS ?? '5000', 10),
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  // Global rate limiting (applies to every route via the ThrottlerGuard
  // APP_GUARD). Auth-sensitive routes (register/login/refresh) additionally
  // set a stricter `@Throttle()` override in their controller.
  throttleTtlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  authThrottleTtlMs: parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10),
  authThrottleLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '5', 10),
  // Mail — provider-selected-by-env, same pattern as GEOCODING_PROVIDER.
  // `local` (default) logs instead of sending; `smtp` requires SMTP_HOST at minimum.
  mailProvider: process.env.MAIL_PROVIDER ?? 'local',
  mailFromAddress: process.env.MAIL_FROM_ADDRESS ?? 'no-reply@shopnest.local',
  // Test-only "fake inbox" file — see local-mail.adapter.ts. Never set outside
  // an explicit E2E test run; unset (default) means zero behavior change.
  mailTestCaptureFile: process.env.MAIL_TEST_CAPTURE_FILE ?? '',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  emailVerificationTokenTtlMs: parseInt(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MS ?? `${24 * 60 * 60 * 1000}`, 10),
  passwordResetTokenTtlMs: parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MS ?? `${60 * 60 * 1000}`, 10),
  vendorStaffInviteTtlMs: parseInt(process.env.VENDOR_STAFF_INVITE_TTL_MS ?? `${7 * 24 * 60 * 60 * 1000}`, 10),
  // Payment — same provider-selected-by-env shape as mail/geocoding, but
  // only one adapter exists in this scope (no real gateway credentials
  // available — see DECISIONS.md). An amount that exactly matches this
  // deliberately declines, so the decline path is directly testable.
  paymentMockDeclineCents: parseInt(process.env.PAYMENT_MOCK_DECLINE_CENTS ?? '66600', 10),
  // Media storage — same provider-selected-by-env shape as mail/payment;
  // only a local-filesystem adapter exists in this scope (no bucket
  // credentials available). publicBaseUrl is this API's own externally
  // reachable origin — uploaded files are served back from here, and the
  // URL returned to a caller must be absolute (the frontend is a
  // different origin), not a path relative to this process.
  mediaProvider: process.env.MEDIA_PROVIDER ?? 'local',
  mediaUploadDir: process.env.MEDIA_UPLOAD_DIR ?? 'uploads',
  mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`,
  mediaMaxFileSizeBytes: parseInt(process.env.MEDIA_MAX_FILE_SIZE_BYTES ?? `${5 * 1024 * 1024}`, 10),
  mediaMaxImageDimensionPx: parseInt(process.env.MEDIA_MAX_IMAGE_DIMENSION_PX ?? '8000', 10),
}));
