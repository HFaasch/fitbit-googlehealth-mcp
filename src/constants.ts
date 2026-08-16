export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const HEALTH_API_BASE = 'https://health.googleapis.com/v4';

// https://developers.google.com/health/scopes
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'openid',
  'email',
] as const;

export const DEFAULT_TIMEOUT = 15000;
