export type ResolvedLocation = {
  label: string;
  details: string;
};

export type LocationSuggestion = ResolvedLocation & {
  id: string;
};

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

export interface GeocodingProvider {
  reverse(latitude: number, longitude: number): Promise<ResolvedLocation>;
  search(query: string): Promise<LocationSuggestion[]>;
}
