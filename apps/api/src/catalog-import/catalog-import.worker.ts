import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogImportRun, CatalogImportStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogImportService } from './catalog-import.service';

@Injectable()
export class CatalogImportWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CatalogImportWorker.name);
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: CatalogImportService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get<boolean>('app.catalogWorkerEnabled', true)) return;
    const intervalMs = this.config.get<number>('app.catalogWorkerPollMs', 2000);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const job = await this.claimNextRun();
      if (!job) return;
      try {
        await this.imports.executeRun(job.id);
        this.logger.log(`Catalog synchronization ${job.id} succeeded`);
      } catch (error) {
        await this.recordFailure(job, error);
      }
    } finally {
      this.polling = false;
    }
  }

  private async claimNextRun(): Promise<CatalogImportRun | null> {
    const leaseSeconds = this.config.get<number>('app.catalogWorkerLeaseSeconds', 300);
    const rows = await this.prisma.$queryRaw<CatalogImportRun[]>(Prisma.sql`
      WITH candidate AS (
        SELECT id FROM "CatalogImportRun"
        WHERE (
          (status = 'QUEUED' AND "availableAt" <= NOW()) OR
          (status = 'RUNNING' AND "lockedAt" < NOW() - (${leaseSeconds} * INTERVAL '1 second'))
        )
        ORDER BY "availableAt", "startedAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "CatalogImportRun" AS run
      SET status = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${this.workerId},
          "attemptCount" = "attemptCount" + 1
      FROM candidate WHERE run.id = candidate.id
      RETURNING run.*
    `);
    return rows[0] ?? null;
  }

  private async recordFailure(job: CatalogImportRun, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : 'Unknown import failure').slice(0, 1000);
    const retry = job.attemptCount < job.maxAttempts;
    const delaySeconds = Math.min(30 * 2 ** Math.max(job.attemptCount - 1, 0), 600);
    await this.prisma.catalogImportRun.update({
      where: { id: job.id },
      data: retry
        ? {
            status: CatalogImportStatus.QUEUED,
            availableAt: new Date(Date.now() + delaySeconds * 1000),
            lockedAt: null,
            lockedBy: null,
            errorMessage: message,
          }
        : {
            status: CatalogImportStatus.FAILED,
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            errorMessage: message,
          },
    });
    this.logger.error(`Catalog synchronization ${job.id} failed${retry ? '; retry scheduled' : ''}: ${message}`);
  }
}
