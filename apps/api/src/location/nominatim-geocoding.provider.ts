import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodingProvider, LocationSuggestion, ResolvedLocation } from './location.types';

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
};

type NominatimResponse = {
  place_id?: number;
  display_name?: string;
  address?: NominatimAddress;
};

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('app.geocodingUrl')!;
    this.timeoutMs = config.get<number>('app.geocodingTimeoutMs')!;
  }

  async reverse(latitude: number, longitude: number): Promise<ResolvedLocation> {
    const url = new URL('/reverse', this.baseUrl);
    url.search = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '16',
    }).toString();

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ShopNest/1.0 (delivery-location)',
        },
      });
    } catch {
      throw new BadGatewayException('Location service is temporarily unavailable');
    }

    if (!response.ok) {
      throw new BadGatewayException('Location service is temporarily unavailable');
    }

    const body = (await response.json()) as NominatimResponse;
    const address = body.address ?? {};
    const locality =
      address.city ?? address.town ?? address.village ?? address.municipality ?? address.county;
    const label = locality ?? address.state ?? address.country;

    if (!label) {
      throw new BadGatewayException('We could not identify this location');
    }

    const detailParts = [
      address.state && address.state !== label ? address.state : undefined,
      address.postcode,
      address.country,
    ].filter((value): value is string => Boolean(value));

    return {
      label,
      details: detailParts.join(', ') || body.display_name || label,
    };
  }

  async search(query: string): Promise<LocationSuggestion[]> {
    const url = new URL('/search', this.baseUrl);
    url.search = new URLSearchParams({
      q: `${query}, Punjab, Pakistan`,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'pk',
      bounded: '1',
      viewbox: '69.25,34.05,75.45,27.65',
      limit: '6',
    }).toString();

    const response = await this.fetch(url);
    const results = (await response.json()) as NominatimResponse[];

    return results
      .map((result) => this.toSuggestion(result))
      .filter((result): result is LocationSuggestion => result !== null);
  }

  private async fetch(url: URL): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ShopNest/1.0 (delivery-location)',
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

  private toSuggestion(result: NominatimResponse): LocationSuggestion | null {
    const address = result.address ?? {};
    const label =
      address.city ?? address.town ?? address.village ?? address.municipality ?? address.county;
    if (!label || !result.place_id) return null;

    return {
      id: `osm:${result.place_id}`,
      label,
      details:
        result.display_name ?? [label, address.state, address.country].filter(Boolean).join(', '),
    };
  }
}
