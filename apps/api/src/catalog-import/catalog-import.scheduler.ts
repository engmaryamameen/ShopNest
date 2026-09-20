import { ConflictException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSource } from '@prisma/client';
import { CatalogImportService } from './catalog-import.service';

@Injectable()
export class CatalogImportScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CatalogImportScheduler.name);
  private initialTimer?: NodeJS.Timeout;
  private recurringTimer?: NodeJS.Timeout;

  constructor(
    private readonly imports: CatalogImportService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get<boolean>('app.catalogScheduleEnabled', true)) return;
    const intervalMs = this.config.get<number>('app.catalogScheduleIntervalMs', 21_600_000);
    this.initialTimer = setTimeout(() => void this.enqueue(), 5_000);
    this.recurringTimer = setInterval(() => void this.enqueue(), intervalMs);
    this.initialTimer.unref();
    this.recurringTimer.unref();
  }

  onApplicationShutdown() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.recurringTimer) clearInterval(this.recurringTimer);
  }

  private async enqueue(): Promise<void> {
    try {
      // Off by default (CATALOG_SCHEDULE_ENABLED=false — see .env.example);
      // scheduled to DummyJSON specifically if ever re-enabled. Open Food
      // Facts has no commercial data to keep in sync unattended and stays
      // manual-only, triggered from the admin imports panel.
      const run = await this.imports.enqueue(CatalogSource.DUMMY_JSON);
      this.logger.log(`Queued scheduled catalog synchronization ${run.id}`);
    } catch (error) {
      if (error instanceof ConflictException) return;
      const message = error instanceof Error ? error.message : 'Unknown scheduling failure';
      this.logger.error(`Could not queue scheduled catalog synchronization: ${message}`);
    }
  }
}
