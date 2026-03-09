export const VISA_SPONSOR_PROVIDER_IDS = ["uk"] as const;

export type VisaSponsorProviderId = (typeof VISA_SPONSOR_PROVIDER_IDS)[number];

export interface VisaSponsorProviderMetadata {
  label: string;
  countryKey: string;
}

export const VISA_SPONSOR_PROVIDER_METADATA: Record<
  VisaSponsorProviderId,
  VisaSponsorProviderMetadata
> = {
  uk: {
    label: "United Kingdom",
    countryKey: "united kingdom",
  },
};

export function isVisaSponsorProviderId(
  value: string,
): value is VisaSponsorProviderId {
  return (VISA_SPONSOR_PROVIDER_IDS as readonly string[]).includes(value);
}
