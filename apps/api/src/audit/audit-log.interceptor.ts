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

  private static readonly REDACTED_BODY_KEYS = new Set(['password', 'passwordHash']);

  private safeBody(body: unknown): Prisma.InputJsonValue | undefined {
    if (!body || typeof body !== 'object') return undefined;
    // Never persist credentials into an audit trail, even incidentally —
    // no current admin-mutation DTO carries one, but this is cheap insurance
    // against a future one (e.g. an admin-created-user flow) doing so.
    const entries = Object.entries(body as Record<string, unknown>).filter(
      ([key]) => !AuditLogInterceptor.REDACTED_BODY_KEYS.has(key),
    );
    return Object.fromEntries(entries) as Prisma.InputJsonValue;
  }
}
