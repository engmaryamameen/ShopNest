import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { CATALOG_SOURCE_ADAPTER } from './catalog-source.adapter';
import { DummyJsonAdapter } from './dummy-json.adapter';

@Module({
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    DummyJsonAdapter,
    { provide: CATALOG_SOURCE_ADAPTER, useExisting: DummyJsonAdapter },
  ],
})
export class CatalogImportModule {}
