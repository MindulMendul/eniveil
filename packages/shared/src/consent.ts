export const CONSENT_VERSION = 2;
export const CONSENT_MAX_AGE = 30 * 86400;
export const ANONYMOUS_CONSENT_MAX_AGE = 15 * 60;
export const CONSENT_BIND_WINDOW_MS = 5 * 60 * 1000;
export const consentScopes = ['none', 'basic', 'full'] as const;
export type ConsentScope = typeof consentScopes[number];
export type CollectionConsent = { version: number; scope: ConsentScope; updatedAt: string; expiresAt: string; accountId: string | null };
