import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogSource, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportWorker } from './catalog-import.worker';
import { ImportScopeDto } from './dto/import-scope.dto';
import { ArchiveImportedProductsDto } from './dto/archive-imported-products.dto';

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

  @Get('categories')
  @ApiOperation({ summary: 'Search source categories' })
  categories(@Query('source') source: CatalogSource, @Query('q') query = '') {
    return this.imports.searchCategories(source, query);
  }

  @Get('options')
  options() {
    return this.imports.options();
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    const run = await this.imports.retry(id);
    void this.worker.poll();
    return run;
  }

  @Get('products')
  importedProducts() {
    return this.imports.listImportedProducts();
  }

  @Post('preview')
  @ApiOperation({
    summary:
      '[Admin] Dry run — see what a sync with this source/scope would do, without writing anything',
  })
  async preview(@Body() scope: ImportScopeDto) {
    const { source, ...settings } = scope;
    const preview = await this.imports.queuePreview(source, settings);
    this.worker
      .poll()
      .catch((error: Error) => this.logger.error(`Preview worker failed: ${error.message}`));
    return preview;
  }

  @Get('previews/:id')
  previewStatus(@Param('id') id: string) {
    return this.imports.previewStatus(id);
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({
    action: 'ADMIN_CATALOG_IMPORT_TRIGGER',
    targetType: 'CatalogImportRun',
    idSource: 'body:id',
  })
  @ApiOperation({
    summary:
      '[Admin] Queue a catalog synchronization from the given source, optionally scoped, and process it now',
  })
  async triggerImport(@Body() scope: ImportScopeDto, @CurrentUser() user?: JwtPayload) {
    const { source, ...settings } = scope;
    const run = await this.imports.enqueue(source, settings, user?.sub);
    // Use the worker's durable claim/lease/retry path for immediate dispatch too.
    this.worker.poll().catch((error: unknown) => {
      this.logger.error(
        `Immediate processing of catalog synchronization ${run.id} failed to start: ${(error as Error).message}`,
      );
    });
    return run;
  }

  @Post('archive-preview')
  @ApiOperation({ summary: 'Summarize imported products eligible for archiving' })
  archivePreview(@Body() filter: ArchiveImportedProductsDto) {
    return this.imports.archiveImportedProducts(filter, false);
  }

  @Post('archive')
  @Audit({ action: 'ADMIN_PRODUCT_ARCHIVE', targetType: 'Product' })
  @ApiOperation({ summary: 'Archive imported products without deleting order history' })
  archive(@Body() filter: ArchiveImportedProductsDto) {
    return this.imports.archiveImportedProducts(filter, true);
  }

  @Get()
  @ApiOperation({ summary: '[Admin] List recent catalog import runs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  listRuns(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.imports.listRuns(limit);
  }
}
