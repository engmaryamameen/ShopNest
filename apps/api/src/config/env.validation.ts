import { plainToInstance } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsUrl,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Fail-fast environment contract for the API process. Validated once at
 * boot (`ConfigModule.forRoot({ validate })`, `app.module.ts`) — a missing
 * or malformed variable throws immediately with every problem listed at
 * once, instead of the previous behavior where secrets silently defaulted
 * to `''` and only surfaced as a runtime error the first time something
 * tried to use them (e.g. signing the first JWT).
 *
 * Only variables with real correctness/security stakes are validated here
 * (connection string, secrets, node env). Purely operational tuning knobs
 * (timeouts, poll intervals, feature flags) keep their `??` defaults in
 * `app.config.ts` — validating every tunable would be enforcement theater,
 * not safety.
 */
class EnvironmentVariables {
  @IsUrl(
    { protocols: ['postgresql', 'postgres'], require_tld: false },
    { message: 'DATABASE_URL must be a postgresql:// connection string' },
  )
  DATABASE_URL!: string;

  @IsOptional()
  @IsIn(Object.values(NodeEnv))
  NODE_ENV?: NodeEnv;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters — generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
  })
  JWT_ACCESS_SECRET!: string;

  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters — generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
  })
  JWT_REFRESH_SECRET!: string;

  // LocalMailAdapter logs verification/reset/invite tokens in full (that's
  // the point of it — a dev-mode "fake inbox"). In production that would
  // mean bearer tokens for account takeover sitting in stdout/log
  // aggregators. Fail at boot rather than silently defaulting to `local` if
  // an operator forgets to configure SMTP for a production deploy.
  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === NodeEnv.Production)
  @Equals('smtp', {
    message: 'MAIL_PROVIDER must be "smtp" in production — the local adapter logs bearer tokens in full and must never run outside development/test',
  })
  MAIL_PROVIDER?: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .map((message) => `  • ${message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration — refusing to start:\n${messages}`);
  }

  return validated;
}
