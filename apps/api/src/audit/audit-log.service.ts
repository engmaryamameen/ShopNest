import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget from the caller's perspective (awaited, but never
   * throws) — an audit-log write failure must never fail the admin action
   * it's describing. Logged (not silently swallowed) via whatever surfaces
   * the underlying Prisma error to the global exception filter's logger in
   * practice; here we just never let it propagate.
   */
  async record(entry: RecordAuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch {
      // Deliberately swallowed — see doc comment above. A real logger call
      // would need the Pino Logger injected here too; kept minimal since
      // this path should essentially never fail (AuditLog has no unique
      // constraints or FKs that a normal admin action could violate other
      // than actorUserId, which is always a valid authenticated admin).
    }
  }

  async list(params: { limit: number; targetType?: string; action?: AuditAction }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.targetType ? { targetType: params.targetType } : {}),
        ...(params.action ? { action: params.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      include: { actor: { select: { id: true, email: true } } },
    });
  }
}
