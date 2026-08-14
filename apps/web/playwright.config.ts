import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// A file-based "fake inbox" LocalMailAdapter writes to when this is set
// (see apps/api/src/mail/local-mail.adapter.ts) — the account-lifecycle
// suite reads verification/reset links out of it instead of needing any
// HTTP-reachable backdoor. Only ever set for this CI/E2E run.
//
// In CI, the `webServer` block below starts the API itself and passes it
// this exact path, so it's always in sync. Running locally against a
// manually-started API (the project's existing "assumes both are already
// running" convention), there's no automatic wiring between "what path did
// this config compute" and "what path did you tell the API to write to" —
// set MAIL_CAPTURE_FILE_PATH yourself and export the same value as
// MAIL_TEST_CAPTURE_FILE when starting the API, so both sides agree.
export const MAIL_CAPTURE_FILE =
  process.env.MAIL_CAPTURE_FILE_PATH ?? join(mkdtempSync(join(tmpdir(), 'shopnest-e2e-')), 'mail.jsonl');

// Single source of truth for the short test TTL configured on the API below
// — the expired-link tests wait this long (plus margin) before using a
// token. Kept short enough to wait out explicitly, long enough that a
// cold-cache first page load elsewhere in the suite won't spuriously expire
// a token the happy-path tests need to still be valid.
export const TEST_TOKEN_TTL_MS = 8000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // auth tests share state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // A login/register with no explicit `returnTo` lands on `/` first, which
  // itself redirects to `/shop` — a legitimate two-hop chain. Under a cold
  // dev-server cache (each route compiles on first hit) or a busy CI
  // runner, that can comfortably exceed Playwright's 5s default. 10s is
  // still tight enough to fail fast on an actually-broken assertion.
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Default: Playwright's own pinned/tested Chromium build (the right
      // choice for CI, which installs it fresh via `playwright install`).
      // PLAYWRIGHT_USE_SYSTEM_CHROME=1 switches to whatever Chrome is
      // already on the machine instead — for environments (e.g. a
      // network-restricted sandbox) where downloading Playwright's browser
      // isn't possible but a system Chrome already is.
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME ? { channel: 'chrome' as const } : {}),
      },
      // mobile.spec.ts is exercised only by the mobile-chromium project
      // below — running it again at a desktop viewport would assert
      // "no horizontal overflow" against a viewport that was never at risk
      // of it.
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME ? { channel: 'chrome' as const } : {}),
      },
      // The mobile project only runs the responsive-layout spec — the full
      // functional suite already runs once under desktop; duplicating every
      // test at every viewport is not proportionate to what changes between
      // them (layout/interaction affordances, not business logic).
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  // Starts the full stack this suite needs (API + web) when run in CI —
  // locally, `pnpm test:e2e` still assumes both are already running (faster
  // iteration), matching the project's existing convention.
  webServer: process.env.CI
    ? [
        {
          command: 'node dist/src/main.js',
          cwd: '../api',
          url: `${API_URL}/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            MAIL_TEST_CAPTURE_FILE: MAIL_CAPTURE_FILE,
            // Short-lived (but not razor-thin) tokens so the "expired link"
            // journey doesn't need real hours of wall-clock waiting in CI —
            // this value is shared by every test in the run, including the
            // happy-path ones, so it has to comfortably outlast a normal
            // register→read-mail→navigate round trip (a first-compile-hit
            // page load under a cold dev/CI cache can itself take a few
            // seconds) while still being short enough to wait out
            // explicitly in the expired-link tests (see EXPIRED_TOKEN_WAIT_MS
            // in account-lifecycle.spec.ts, kept in sync with this value).
            EMAIL_VERIFICATION_TOKEN_TTL_MS: String(TEST_TOKEN_TTL_MS),
            PASSWORD_RESET_TOKEN_TTL_MS: String(TEST_TOKEN_TTL_MS),
            CATALOG_WORKER_ENABLED: 'false',
            CATALOG_SCHEDULE_ENABLED: 'false',
          },
        },
        {
          command: 'pnpm start',
          url: WEB_URL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : undefined,
});
