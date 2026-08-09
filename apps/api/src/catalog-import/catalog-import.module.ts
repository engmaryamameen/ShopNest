import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { CATALOG_SOURCE_ADAPTER } from './catalog-source.adapter';
import { DummyJsonAdapter } from './dummy-json.adapter';
import { CatalogImportWorker } from './catalog-import.worker';
import { CatalogImportScheduler } from './catalog-import.scheduler';

@Module({
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    CatalogImportWorker,
    CatalogImportScheduler,
    DummyJsonAdapter,
    { provide: CATALOG_SOURCE_ADAPTER, useExisting: DummyJsonAdapter },
  ],
})
export class CatalogImportModule {}
