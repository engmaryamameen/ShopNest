import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';
import { AUDIT_KEY, type AuditMetadata } from './audit.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

/**
 * Registered globally (`app.module.ts`, `APP_INTERCEPTOR`). A no-op on any
 * route without an `@Audit()` decorator. On a decorated route, writes one
 * `AuditLog` row after the handler succeeds — never before, so a
 * subsequently-thrown error (e.g. a downstream validation failure) never
 * produces a misleading "this happened" row for something that didn't.
 *
 * Failure semantics (see `AuditLogService.record()` for the enforcement):
 * the write is fire-and-forget from the request's perspective — never
 * awaited, and `record()` never throws. A dropped audit row (e.g. a DB
 * blip at the exact moment) can never turn a successful mutation into a
 * failed HTTP response, and can never delay the response either. This is a
 * deliberate tradeoff: this audit trail is best-effort observability, not
 * a transactionally-guaranteed compliance log. If a future requirement
 * needs the latter, the fix is writing the AuditLog row inside the same
 * Prisma transaction as the mutation (or an outbox/relay pattern) — not
 * something this interceptor can provide, since it runs outside and after
 * whatever transaction the handler used.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();

    return next.handle().pipe(
      tap((response) => {
        const targetId = this.resolveTargetId(metadata, request, response);
        if (!targetId) return;

        void this.auditLog.record({
          actorUserId: request.user?.sub ?? null,
          action: metadata.action,
          targetType: metadata.targetType,
          targetId,
          ipAddress: request.ip ?? null,
          metadata: this.safeBody(request.body),
        });
      }),
    );
  }

  private resolveTargetId(metadata: AuditMetadata, request: Request, response: unknown): string | null {
    const paramId = this.paramId(request);
    if ((metadata.idSource ?? 'param:id') === 'param:id') {
      return paramId ?? this.responseId(response);
    }
    return this.responseId(response) ?? paramId;
  }

  // Express 5 types `Request.params[key]` as `string | string[]` to allow
  // for wildcard route segments — none of the `:id` routes this decorator
  // is used on are wildcards, so a single value is always what's present.
  private paramId(request: Request): string | null {
    const raw = request.params?.id;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
    return null;
  }

  // Defensive against interceptor ordering relative to
  // ResponseTransformInterceptor — reads the id whether `response` is the
  // raw handler return value or the `{ data, timestamp }` envelope.
  private responseId(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const obj = response as { id?: unknown; data?: { id?: unknown } };
    if (typeof obj.id === 'string') return obj.id;
    if (typeof obj.data?.id === 'string') return obj.data.id;
    return null;
  }

  // Case-insensitive substring match, not an exact-key set — cheap
  // insurance against a future DTO field like `newPassword`,
  // `currentPassword`, or `apiSecret` landing in an audited request body
  // without anyone remembering to extend an exact-match list.
  private static readonly REDACTED_BODY_KEY_PATTERN = /password|token|secret|hash/i;
  private static readonly MAX_DEPTH = 6;
  private static readonly MAX_ARRAY_ITEMS = 50;

  private safeBody(body: unknown): Prisma.InputJsonValue | undefined {
    if (!body || typeof body !== 'object') return undefined;
    try {
      return this.redactValue(body, 0, new WeakSet<object>()) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }

  private redactValue(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (depth >= AuditLogInterceptor.MAX_DEPTH) return '[max depth exceeded]';
    if (ancestors.has(value)) return '[circular]';

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return value
          .slice(0, AuditLogInterceptor.MAX_ARRAY_ITEMS)
          .map((item) => this.redactValue(item, depth + 1, ancestors));
      }

      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (AuditLogInterceptor.REDACTED_BODY_KEY_PATTERN.test(key)) continue;
        result[key] = this.redactValue(val, depth + 1, ancestors);
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
}
