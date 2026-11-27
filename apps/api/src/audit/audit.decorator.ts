import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  action: AuditAction;
  targetType: string;
  /**
   * Where to read the audited row's id from once the handler succeeds.
   * `param:id` (default) reads `request.params.id` — correct for
   * PATCH/DELETE routes. `body:id` reads the JSON response body's `id`
   * field — needed for POST-create routes, where there's no route param
   * yet and the id only exists once the handler returns it.
   */
  idSource?: 'param:id' | 'body:id';
}

/**
 * Marks a controller method as an auditable admin/vendor mutation.
 * `AuditLogInterceptor` (registered globally) does the actual write after
 * the handler succeeds — declarative and impossible to forget on a new
 * route the way a manual `auditLogService.record(...)` call at each site
 * would be.
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);
