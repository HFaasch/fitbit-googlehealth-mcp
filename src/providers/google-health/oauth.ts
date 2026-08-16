import { GOOGLE_TOKEN_URL } from '../../constants';
import type { Env } from '../../types';

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
  scope?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  env: Env,
): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string, env: Env): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google access token refresh failed (${response.status}): ${body.slice(0, 300)}. ` +
        'The refresh token may have been revoked or expired (Google refresh tokens expire after 6 months of inactivity) - re-authorize the connector.',
    );
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/** Decodes the email claim from an ID token without verifying the signature (display purposes only, not a security boundary). */
export function decodeEmailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { email?: string };
    return claims.email;
  } catch {
    return undefined;
  }
}
