import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogSourceRegistry } from './catalog-source-registry';
import { DummyJsonAdapter } from './dummy-json.adapter';
import { OpenFoodFactsAdapter } from './open-food-facts.adapter';
import { AmazonAdapter } from './amazon.adapter';
import { CatalogImportWorker } from './catalog-import.worker';
import { CatalogImportScheduler } from './catalog-import.scheduler';

@Module({
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    CatalogImportWorker,
    CatalogImportScheduler,
    DummyJsonAdapter,
    OpenFoodFactsAdapter,
    AmazonAdapter,
    CatalogSourceRegistry,
  ],
})
export class CatalogImportModule {}
