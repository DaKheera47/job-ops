export const PASSKEY_DEVICE_TYPES = ["singleDevice", "multiDevice"] as const;

export type PasskeyDeviceType = (typeof PASSKEY_DEVICE_TYPES)[number];

export interface PasskeySummary {
  id: string;
  name: string;
  deviceType: PasskeyDeviceType | null;
  backedUp: boolean;
  transports: string[] | null;
  createdAt: string;
  /** Unix epoch seconds, or null when the passkey has never been used. */
  lastUsedAt: number | null;
}

export interface PasskeyLoginOptionsResponse {
  challengeId: string;
  options: Record<string, unknown>;
}

export interface PasskeyRegistrationOptionsResponse {
  options: Record<string, unknown>;
}
