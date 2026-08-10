import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodingProvider, ResolvedLocation } from './location.types';

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
}
