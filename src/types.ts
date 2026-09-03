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
  /**
   * Optional contact address shown on the /privacy page. Set it per deployment
   * (wrangler.toml [vars] or `wrangler secret put PRIVACY_CONTACT`) so no
   * personal address is committed to the repo. If unset, the page omits the line.
   */
  PRIVACY_CONTACT?: string;
}
