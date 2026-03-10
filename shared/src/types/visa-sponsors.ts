import type { VisaSponsorProviderId } from "../visa-sponsor-providers";

export interface VisaSponsor {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

export interface VisaSponsorSearchResult {
  providerId: VisaSponsorProviderId;
  countryKey: string;
  sponsor: VisaSponsor;
  score: number;
  matchedName: string;
}

export interface VisaSponsorSearchResponse {
  results: VisaSponsorSearchResult[];
  query: string;
  total: number;
}

export interface VisaSponsorProviderStatus {
  providerId: VisaSponsorProviderId;
  countryKey: string;
  lastUpdated: string | null;
  csvPath: string | null;
  totalSponsors: number;
  isUpdating: boolean;
  nextScheduledUpdate: string | null;
  error: string | null;
}

export interface VisaSponsorStatusResponse {
  providers: VisaSponsorProviderStatus[];
}

/**
 * Implemented by each country-specific visa sponsor provider.
 * Providers only own what is country-specific: HTTP fetching and parsing.
 * Storage, scheduling, caching, and search are handled by the service layer.
 */
export interface VisaSponsorProviderManifest {
  /** Unique slug, must be in VISA_SPONSOR_PROVIDER_IDS catalog. e.g. "uk", "au" */
  id: VisaSponsorProviderId;
  /** Human-readable display name. e.g. "United Kingdom" */
  displayName: string;
  /** normalizeCountryKey()-compatible string. e.g. "united kingdom", "australia" */
  countryKey: string;
  /** UTC hour (0-23) for daily scheduled refresh. Defaults to 2. */
  scheduledUpdateHour?: number;
  /** Fetch and return the full sponsor list. Throws on failure. */
  fetchSponsors(): Promise<VisaSponsor[]>;
}
