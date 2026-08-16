import { Hono } from 'hono';
import { GOOGLE_AUTH_URL, GOOGLE_HEALTH_SCOPES } from '../constants';
import { decodeEmailFromIdToken, exchangeCodeForTokens } from '../providers/google-health/oauth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.html(landingPageHtml(new URL(c.req.url).origin)));

app.get('/authorize', async (c) => {
  const authRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  const stateKey = crypto.randomUUID();
  await c.env.OAUTH_KV.put(`auth_request:${stateKey}`, JSON.stringify(authRequest), {
    expirationTtl: 600,
  });

  return c.html(approvalDialogHtml(authRequest.clientId, stateKey));
});

app.post('/authorize', async (c) => {
  const formData = await c.req.formData();
  const stateKey = formData.get('state_key') as string;

  const authRequestStr = await c.env.OAUTH_KV.get(`auth_request:${stateKey}`);
  if (!authRequestStr) return c.text('Session expired, please try again', 400);

  const callbackUrl = `${new URL(c.req.url).origin}/callback`;
  const googleAuthUrl = new URL(GOOGLE_AUTH_URL);
  googleAuthUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', callbackUrl);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', GOOGLE_HEALTH_SCOPES.join(' '));
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'consent');
  googleAuthUrl.searchParams.set('state', stateKey);

  return c.redirect(googleAuthUrl.toString());
});

app.get('/callback', async (c) => {
  const code = c.req.query('code');
  const stateKey = c.req.query('state');
  const error = c.req.query('error');

  if (error) return c.text(`Google OAuth error: ${error}`, 400);
  if (!code || !stateKey) return c.text('Missing code or state', 400);

  const authRequestStr = await c.env.OAUTH_KV.get(`auth_request:${stateKey}`);
  if (!authRequestStr) return c.text('Auth session expired, please try again', 400);
  await c.env.OAUTH_KV.delete(`auth_request:${stateKey}`);
  const authRequest = JSON.parse(authRequestStr);

  const callbackUrl = `${new URL(c.req.url).origin}/callback`;
  const tokens = await exchangeCodeForTokens(code, callbackUrl, c.env);

  if (!tokens.refresh_token) {
    return c.text(
      'Google did not return a refresh token. Revoke this app\'s access at ' +
        'https://myaccount.google.com/permissions and try authorizing again.',
      400,
    );
  }

  const email = decodeEmailFromIdToken(tokens.id_token);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: email ?? crypto.randomUUID(),
    metadata: { label: email ? `Google Health (${email})` : 'Google Health' },
    scope: authRequest.scope || [],
    props: {
      googleRefreshToken: tokens.refresh_token,
      googleEmail: email,
    },
  });

  return c.redirect(redirectTo, 302);
});

function landingPageHtml(origin: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Health MCP Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; line-height: 1.6; }
    code { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Google Health MCP Server</h1>
  <p>Connect your Google Health (sleep) data to Claude or ChatGPT.</p>
  <ol>
    <li>Add a custom connector with URL <code>${origin}/mcp</code></li>
    <li>Authorize with your Google account</li>
    <li>Ask about your sleep data</li>
  </ol>
</body>
</html>`;
}

function approvalDialogHtml(clientId: string, stateKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Health MCP Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; line-height: 1.6; background: #fafafa; }
    .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #4285F4; margin-bottom: 8px; font-size: 20px; }
    .app { background: #f1f5f9; border-radius: 8px; padding: 12px; margin: 16px 0; font-family: monospace; font-size: 13px; word-break: break-all; }
    button { background: #4285F4; color: white; border: none; border-radius: 8px; padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Health MCP Server</h1>
    <p>An application wants to read your Google Health sleep data.</p>
    <div class="app">Application: ${clientId}</div>
    <form method="POST" action="/authorize">
      <input type="hidden" name="state_key" value="${stateKey}">
      <button type="submit">Authorize with Google</button>
    </form>
  </div>
</body>
</html>`;
}

export const AuthHandler = app;
