# Authentication

The web app uses the API for email registration, sign-in, recovery and Google sign-in. Registration sends a six-digit code before creating the account. The pending signup keeps a password hash, a hashed challenge and a keyed code hash; the password is hashed with Argon2id. Verification codes expire after ten minutes and have an attempt limit. Email delivery can fail, so a submitted registration is not proof that an account was created.

Access and refresh tokens are held in HTTP-only, SameSite=Lax cookies, with Secure enabled in production. The API checks the access token against its session family. Logout and password reset revoke sessions server-side. Password recovery tokens are stored as hashes and can be used once before expiry. Vendor and administrator permissions are enforced by API guards and services as well as the interface.

## Local configuration

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. Set a local PostgreSQL `DATABASE_URL` and independent, random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values. Follow [migration recovery](migrations/0016-recovery.md) before applying migrations; never reset an existing database to resolve migration errors.

`MAIL_PROVIDER=local` logs messages rather than delivering them and must be used only with disposable test accounts. To send real email, configure `MAIL_PROVIDER=smtp`, `MAIL_FROM_ADDRESS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` in the API environment. Use an inbox you control and do not commit credentials. For Google sign-in, configure the three `GOOGLE_` settings shown in the example and register the matching callback in Google Cloud; see [Google sign-in](google-sign-in.md). Restart the relevant process after changing environment variables.

## Checks

From the repository root, `pnpm --filter @shopnest/api type-check` checks API types. Auth unit tests can be run with `pnpm --filter @shopnest/api exec jest --runInBand src/auth/__tests__ src/auth/dto/email-validation.spec.ts`. The database integration tests in `apps/api/test/signup.integration.spec.ts`, `google-link.integration.spec.ts` and `auth-security.integration.spec.ts` require a separately provisioned, migrated disposable database and `SHOPNEST_DISPOSABLE_DB=true`; they mock email delivery and do not verify an inbox.

## Known limitations

- Refresh-token rotation does not recover a replacement cookie when its response is lost. A concurrent request within the grace period receives a conflict, and replay after that period revokes the family. This is a session reliability blocker; test lost responses and multiple tabs before release.
- Recovery and verification endpoints use generic responses, but the time taken to send mail may reveal whether an address exists. Rate limits and response text do not eliminate this timing difference.
- A failed new signup attempt can replace an earlier pending challenge for the same address; an account created just before session issuance fails may require the user to sign in instead. These recovery cases need further work.
- Older full-stack tests still assume registration creates a session immediately. Update them for the code-verification step before relying on them for release evidence.
- Google and SMTP require their external configuration and a controlled account or inbox for end-to-end verification. Unit and database tests with mocked delivery do not prove either service delivered successfully.
