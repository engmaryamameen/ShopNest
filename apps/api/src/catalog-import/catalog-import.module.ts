import { OpenBeautyFactsAdapter } from './open-beauty-facts.adapter';
import { DarazAdapter } from './daraz.adapter';
import { PromotionsModule } from '../promotions/promotions.module';
import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogSourceRegistry } from './catalog-source-registry';
import { DummyJsonAdapter } from './dummy-json.adapter';
import { OpenFoodFactsAdapter } from './open-food-facts.adapter';
import { AmazonAdapter } from './amazon.adapter';
import { AmazonBerkeleyAdapter } from './amazon-berkeley.adapter';
import { CatalogImportWorker } from './catalog-import.worker';
import { CatalogImportImagesService } from './catalog-import-images.service';
import { LocalMediaStorageAdapter } from '../media/local-media-storage.adapter';
import { CategoryMappingService } from '../catalog/category-mapping.service';

@Module({
  imports: [PromotionsModule],
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    CategoryMappingService,
    CatalogImportWorker,
    CatalogImportImagesService,
    LocalMediaStorageAdapter,
    DummyJsonAdapter,
    OpenFoodFactsAdapter,
    AmazonAdapter,
    AmazonBerkeleyAdapter,
    OpenBeautyFactsAdapter,
    DarazAdapter,
    CatalogSourceRegistry,
  ],
})
export class CatalogImportModule {}
