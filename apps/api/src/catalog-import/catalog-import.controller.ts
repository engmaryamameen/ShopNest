import { Body, Controller, Get, HttpCode, HttpStatus, Logger, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportWorker } from './catalog-import.worker';
import { ImportScopeDto } from './dto/import-scope.dto';

@ApiTags('catalog imports')
@Controller('admin/catalog-imports')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('access_token')
export class CatalogImportController {
  private readonly logger = new Logger(CatalogImportController.name);

  constructor(
    private readonly imports: CatalogImportService,
    private readonly worker: CatalogImportWorker,
  ) {}

  @Post('preview')
  @ApiOperation({ summary: '[Admin] Dry run — see what a sync with this source/scope would do, without writing anything' })
  preview(@Body() scope: ImportScopeDto) {
    return this.imports.preview(scope.source, scope);
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ADMIN_CATALOG_IMPORT_TRIGGER', targetType: 'CatalogImportRun', idSource: 'body:id' })
  @ApiOperation({ summary: '[Admin] Queue a catalog synchronization from the given source, optionally scoped, and process it now' })
  async triggerImport(@Body() scope: ImportScopeDto) {
    const run = await this.imports.enqueue(scope.source, scope);
    // The background worker/scheduler stay off by default (catalog is
    // admin-curated, not auto-synced) — so without this, a run just
    // enqueued here would sit QUEUED forever with nothing to ever claim
    // it. One explicit poll() reuses the exact same claim/lease/retry
    // path the real worker uses, run once, right now, because an admin
    // asked for it — not a recurring background job.
    this.worker.poll().catch((error: unknown) => {
      this.logger.error(`Immediate processing of catalog synchronization ${run.id} failed to start: ${(error as Error).message}`);
    });
    return run;
  }

  @Get()
  @ApiOperation({ summary: '[Admin] List recent catalog import runs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  listRuns(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.imports.listRuns(limit);
  }
}
