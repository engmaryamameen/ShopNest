import { OpenBeautyFactsAdapter } from './open-beauty-facts.adapter';
import { DarazAdapter } from './daraz.adapter';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { CatalogSource } from '@prisma/client';
import { CatalogSourceAdapter } from './catalog-source.adapter';
import { DummyJsonAdapter } from './dummy-json.adapter';
import { OpenFoodFactsAdapter } from './open-food-facts.adapter';
import { AmazonAdapter } from './amazon.adapter';
import { AmazonBerkeleyAdapter } from './amazon-berkeley.adapter';

/** Resolves a run's `source` column to the adapter that speaks that
 * supplier's API — one call site (CatalogImportService) driven by data
 * (the run row / a request body), not a single adapter wired in at
 * process-start like the mail/payment/media provider selections. */
@Injectable()
export class CatalogSourceRegistry {
  constructor(
    private readonly dummyJson: DummyJsonAdapter,
    private readonly openFoodFacts: OpenFoodFactsAdapter,
    private readonly amazon: AmazonAdapter,
    @Optional() private readonly beauty?: OpenBeautyFactsAdapter,
    @Optional() private readonly daraz?: DarazAdapter,
    @Optional() private readonly berkeley?: AmazonBerkeleyAdapter,
  ) {}

  resolve(source: CatalogSource): CatalogSourceAdapter {
    switch (source) {
      case CatalogSource.AMAZON_BERKELEY:
        if (this.berkeley) return this.berkeley;
        break;
      case CatalogSource.OPEN_BEAUTY_FACTS:
        if (this.beauty) return this.beauty;
        break;
      case CatalogSource.DARAZ:
        if (this.daraz) return this.daraz;
        break;
      case CatalogSource.DUMMY_JSON:
        return this.dummyJson;
      case CatalogSource.OPEN_FOOD_FACTS:
        return this.openFoodFacts;
      case CatalogSource.AMAZON:
        return this.amazon;
      default:
        throw new BadRequestException(`Unsupported catalog source: ${String(source)}`);
    }
    throw new BadRequestException(`Unsupported catalog source: ${source}`);
  }
}
