import type { HiringCafeCountryLocation } from "./country-map.js";

export interface HiringCafeSearchState {
  locations: HiringCafeCountryLocation[];
  workplaceTypes: Array<"Remote" | "Hybrid" | "Onsite">;
  defaultToUserLocation: boolean;
  userLocation: null;
  commitmentTypes: string[];
  seniorityLevel: string[];
  roleTypes: string[];
  roleYoeRange: [number, number];
  excludeIfRoleYoeIsNotSpecified: boolean;
  managementYoeRange: [number, number];
  excludeIfManagementYoeIsNotSpecified: boolean;
  securityClearances: string[];
  searchQuery: string;
  dateFetchedPastNDays: number;
  hiddenCompanies: string[];
  sortBy: "default";
  companyPublicOrPrivate: "all";
  latestInvestmentYearRange: [null, null];
  latestInvestmentSeries: string[];
  latestInvestmentAmount: null;
  latestInvestmentCurrency: string[];
  investors: string[];
  excludedInvestors: string[];
  isNonProfit: "all";
  companySizeRanges: string[];
  minYearFounded: null;
  maxYearFounded: null;
  excludedLatestInvestmentSeries: string[];
}

export function createDefaultSearchState(args: {
  searchQuery: string;
  location: HiringCafeCountryLocation | null;
  dateFetchedPastNDays: number;
}): HiringCafeSearchState {
  return {
    locations: args.location ? [args.location] : [],
    workplaceTypes: ["Remote", "Hybrid", "Onsite"],
    defaultToUserLocation: false,
    userLocation: null,
    commitmentTypes: [
      "Full Time",
      "Part Time",
      "Contract",
      "Internship",
      "Temporary",
      "Seasonal",
      "Volunteer",
    ],
    seniorityLevel: [
      "No Prior Experience Required",
      "Entry Level",
      "Mid Level",
      "Senior Level",
    ],
    roleTypes: ["Individual Contributor", "People Manager"],
    roleYoeRange: [0, 20],
    excludeIfRoleYoeIsNotSpecified: false,
    managementYoeRange: [0, 20],
    excludeIfManagementYoeIsNotSpecified: false,
    securityClearances: [
      "None",
      "Confidential",
      "Secret",
      "Top Secret",
      "Top Secret/SCI",
      "Public Trust",
      "Interim Clearances",
      "Other",
    ],
    searchQuery: args.searchQuery,
    dateFetchedPastNDays: args.dateFetchedPastNDays,
    hiddenCompanies: [],
    sortBy: "default",
    companyPublicOrPrivate: "all",
    latestInvestmentYearRange: [null, null],
    latestInvestmentSeries: [],
    latestInvestmentAmount: null,
    latestInvestmentCurrency: [],
    investors: [],
    excludedInvestors: [],
    isNonProfit: "all",
    companySizeRanges: [],
    minYearFounded: null,
    maxYearFounded: null,
    excludedLatestInvestmentSeries: [],
  };
}
