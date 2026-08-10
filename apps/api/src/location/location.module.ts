import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { GEOCODING_PROVIDER } from './location.types';
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';

@Module({
  controllers: [LocationController],
  providers: [
    LocationService,
    NominatimGeocodingProvider,
    { provide: GEOCODING_PROVIDER, useExisting: NominatimGeocodingProvider },
  ],
})
export class LocationModule {}
