import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Props {
  /** Google OAuth refresh token, used to mint short-lived access tokens per request. */
  googleRefreshToken: string;
  googleEmail?: string;
}

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}
