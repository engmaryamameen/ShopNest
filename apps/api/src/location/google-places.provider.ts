import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodingProvider, LocationSuggestion, ResolvedLocation } from './location.types';

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

@Injectable()
export class GooglePlacesProvider implements GeocodingProvider {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('app.googlePlacesApiKey') ?? '';
    this.timeoutMs = config.get<number>('app.geocodingTimeoutMs') ?? 5000;
  }

  async reverse(latitude: number, longitude: number): Promise<ResolvedLocation> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.search = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: this.apiKey,
      region: 'pk',
      language: 'en',
    }).toString();

    const response = await this.fetch(url);
    const body = (await response.json()) as {
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    const result = body.results?.[0];
    const locality = result?.address_components?.find((component) =>
      component.types.some((type) =>
        ['locality', 'sublocality', 'administrative_area_level_2'].includes(type),
      ),
    )?.long_name;
    if (!result?.formatted_address) {
      throw new BadGatewayException('We could not identify this location');
    }
    return { label: locality ?? 'Current location', details: result.formatted_address };
  }

  async search(query: string): Promise<LocationSuggestion[]> {
    const response = await this.fetch(
      new URL('https://places.googleapis.com/v1/places:autocomplete'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ['pk'],
          languageCode: 'en',
          locationRestriction: {
            rectangle: {
              low: { latitude: 27.65, longitude: 69.25 },
              high: { latitude: 34.05, longitude: 75.45 },
            },
          },
        }),
      },
    );
    const body = (await response.json()) as GoogleAutocompleteResponse;

    return (body.suggestions ?? []).flatMap(({ placePrediction }) => {
      const id = placePrediction?.placeId;
      const label = placePrediction?.structuredFormat?.mainText?.text;
      if (!id || !label) return [];
      return [
        {
          id: `google:${id}`,
          label,
          details: placePrediction.structuredFormat?.secondaryText?.text ?? 'Punjab, Pakistan',
        },
      ];
    });
  }

  private async fetch(url: URL, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          ...init.headers,
        },
      });
    } catch {
      throw new BadGatewayException('Location service is temporarily unavailable');
    }
    if (!response.ok) {
      throw new BadGatewayException('Location service is temporarily unavailable');
    }
    return response;
  }
}
