import { Inject, Injectable } from '@nestjs/common';
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
  type ResolvedLocation,
} from './location.types';

@Injectable()
export class LocationService {
  constructor(@Inject(GEOCODING_PROVIDER) private readonly provider: GeocodingProvider) {}

  reverse(latitude: number, longitude: number): Promise<ResolvedLocation> {
    return this.provider.reverse(latitude, longitude);
  }
}
