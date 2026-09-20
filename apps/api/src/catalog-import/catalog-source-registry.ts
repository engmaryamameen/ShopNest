import { BadRequestException, Injectable } from '@nestjs/common';
import { CatalogSource } from '@prisma/client';
import { CatalogSourceAdapter } from './catalog-source.adapter';
import { DummyJsonAdapter } from './dummy-json.adapter';
import { OpenFoodFactsAdapter } from './open-food-facts.adapter';
import { AmazonAdapter } from './amazon.adapter';

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
  ) {}

  resolve(source: CatalogSource): CatalogSourceAdapter {
    switch (source) {
      case CatalogSource.DUMMY_JSON:
        return this.dummyJson;
      case CatalogSource.OPEN_FOOD_FACTS:
        return this.openFoodFacts;
      case CatalogSource.AMAZON:
        return this.amazon;
      default:
        throw new BadRequestException(`Unsupported catalog source: ${String(source)}`);
    }
  }
}
