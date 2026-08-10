import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { GEOCODING_PROVIDER } from './location.types';
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';
import { GooglePlacesProvider } from './google-places.provider';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [LocationController],
  providers: [
    LocationService,
    NominatimGeocodingProvider,
    GooglePlacesProvider,
    {
      provide: GEOCODING_PROVIDER,
      inject: [ConfigService, GooglePlacesProvider, NominatimGeocodingProvider],
      useFactory: (
        config: ConfigService,
        google: GooglePlacesProvider,
        nominatim: NominatimGeocodingProvider,
      ) => (config.get<string>('app.googlePlacesApiKey') ? google : nominatim),
    },
  ],
})
export class LocationModule {}
