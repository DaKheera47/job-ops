export interface VisaSponsor {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

export interface VisaSponsorSearchResult {
  sponsor: VisaSponsor;
  score: number;
  matchedName: string;
}

export interface VisaSponsorSearchResponse {
  results: VisaSponsorSearchResult[];
  query: string;
  total: number;
}

export interface VisaSponsorStatusResponse {
  lastUpdated: string | null;
  csvPath: string | null;
  totalSponsors: number;
  isUpdating: boolean;
  nextScheduledUpdate: string | null;
  error: string | null;
}
