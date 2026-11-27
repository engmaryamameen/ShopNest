import { Injectable } from '@nestjs/common';
import { OpenFoodFactsAdapter } from './open-food-facts.adapter';
@Injectable()
export class OpenBeautyFactsAdapter extends OpenFoodFactsAdapter {
  protected readonly site: string = 'openbeautyfacts.org';
  protected readonly configPrefix: string = 'openBeautyFacts';
  protected readonly sourceName: string = 'Open Beauty Facts';
}
