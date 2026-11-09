export const CONSENT_VERSION = 2;
export const CONSENT_MAX_AGE = 30 * 86400;
export const consentScopes = ['none', 'basic', 'full'] as const;
export type ConsentScope = typeof consentScopes[number];
export type CollectionConsent = { version: number; scope: ConsentScope; updatedAt: string; accountId: string | null };
