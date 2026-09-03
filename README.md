# google-health-mcp

> A read-only **Model Context Protocol (MCP) server** for the [Google Health API](https://developers.google.com/health)
> (`health.googleapis.com/v4`). TypeScript, deployed as an OAuth-protected Cloudflare Worker,
> usable from Claude (mobile / desktop / web) and ChatGPT as a custom connector.

Personal, single-user by design: fork it and run it on your own Google Cloud project +
Cloudflare account. It exposes **your own** Google Health data (sleep, heart rate, daily
health metrics, body measurements) to an AI assistant — nothing is written back, nothing
is stored except the OAuth refresh token.

> **History:** this repo began as a fork of
> [`tachibanayu24/fitbit-googlehealth-mcp`](https://github.com/tachibanayu24/fitbit-googlehealth-mcp),
> a writable server for the legacy Fitbit Web API (`api.fitbit.com`, shut down September 2026).
> It has since been rewritten for the successor Google Health API. The development log in
> [`docs/journal.md`](docs/journal.md) is Japanese up to mid-2026 and English from 2026-09 on.

---

## Tools

All read-only. Dates are UTC unless noted.

| Tool | Arguments | Returns |
|---|---|---|
| `get_sleep` | `date` (YYYY-MM-DD) | One night: stages, per-stage timings, summary (time asleep/awake, efficiency), short awakenings |
| `get_sleep_range` | `from`, `to` (YYYY-MM-DD) | One compact summary **per night** (duration, efficiency, stage minutes, awakening count). Use `get_sleep` for full stage detail of a single night. |
| `get_daily_metrics` | `metric`, `from`, `to` | A daily metric over a range. `metric` ∈ `respiratory_rate`, `oxygen_saturation`, `resting_heart_rate`, `heart_rate_variability`, `skin_temperature`, `heart_rate_zones` |
| `get_heart_rate` | `date` (YYYY-MM-DD) | Hourly-bucketed heart-rate summary (min/max/avg per hour + daily overview). Raw continuous HR is ~1–2 k samples/hour, so it is aggregated server-side; `partialCoverage: true` is set if a day exceeds the fetch cap. |
| `get_weight_range` | `from`, `to` (YYYY-MM-DD) | Weight measurements in the range |
| `get_body_fat_range` | `from`, `to` (YYYY-MM-DD) | Body-fat-percentage measurements in the range |

Data from multiple sources (a Fitbit/Pixel device, plus anything feeding Health Connect)
is returned as-is, one data point per source.

---

## How it works

- A single Cloudflare Worker ([`src/worker.ts`](src/worker.ts)).
- [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider)
  terminates the MCP client's OAuth (dynamic client registration, `/authorize`, `/token`).
  The client's grant carries **your Google refresh token** as an encrypted prop.
- On every `/mcp` request the Worker mints a short-lived Google access token from that
  refresh token, builds a fresh `McpServer` + Streamable-HTTP transport, and serves the call.
- The only thing persisted in Workers KV (`OAUTH_KV`) is the OAuth state and your refresh
  token. Health data is streamed through the response and never written to storage.

---

## Prerequisites

- A Google account whose Google Health data you want to read (e.g. a Fitbit or Pixel
  Watch synced to it).
- A **Google Cloud project** with the Google Health API enabled.
- A **Cloudflare account** (the free plan is enough).
- **Node.js 20+**.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/HFaasch/fitbit-googlehealth-mcp.git
cd fitbit-googlehealth-mcp
npm install
```

### 2. Google Cloud

1. Create (or pick) a project and **enable the Google Health API**
   (APIs & Services → Library → "Google Health API").
2. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: External.
   - Add the scopes:
     - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
     - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - **Publish the app ("In production").** While it is in "Testing", Google expires
     refresh tokens after **7 days**, which breaks the Worker's unattended refresh. A
     single-user app can stay *unverified* in production (100-user cap, an "unverified
     app" warning on first consent) — that is fine; the point is to lift the 7-day expiry.
   - Publishing with sensitive scopes requires a privacy-policy URL — the Worker serves
     one at `https://<your-worker>/privacy` once deployed (step 4), so deploy first if
     Google asks for it, then come back and publish.
3. **Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**.
   - Authorized redirect URI: `https://<your-worker-subdomain>.workers.dev/callback`
     (you will know the subdomain after the first `npm run deploy`; you can add it then).
   - Note the **Client ID** and **Client secret**.

### 3. Cloudflare

```bash
# KV namespace for OAuth state + refresh token
npx wrangler kv namespace create OAUTH_KV
```

Create `wrangler.toml` (git-ignored — each fork has its own IDs) from this template and
paste in the namespace `id` the command printed:

```toml
name = "google-health-mcp"
main = "src/worker.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "<your-kv-namespace-id>"
```

Set the secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# optional: a contact address shown on the /privacy page
npx wrangler secret put PRIVACY_CONTACT
```

### 4. Deploy

```bash
npm run deploy
# → https://google-health-mcp.<your-subdomain>.workers.dev
```

Add the redirect URI (`https://…workers.dev/callback`) to the OAuth client from step 2.3
if you have not already, and publish the consent screen if it is still in Testing.

### 5. Connect it

Add a custom connector in Claude or ChatGPT with URL:

```
https://google-health-mcp.<your-subdomain>.workers.dev/mcp
```

Authorize with your Google account when prompted. Then ask about your sleep, heart rate,
SpO2, HRV, weight, etc.

---

## Endpoints

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/privacy` | Privacy policy (used for the OAuth consent screen) |
| `/mcp` | MCP Streamable-HTTP endpoint (OAuth-protected) |
| `/authorize`, `/token`, `/register` | OAuth provider (for the MCP client) |
| `/callback` | Google OAuth redirect target |

---

## Notes

- **Single user.** One Google identity per deployment; the last authorization wins.
- **Nothing is written** to Google Health, and no health data is stored by the server.
- **`date` is a UTC calendar day.** If you are not in UTC, `get_sleep`/`get_heart_rate`
  for a given date cover the night that *ended* that morning. `get_sleep_range` reports the
  local end date of each night.
- If the connector suddenly stops working with a 401, the Google refresh token was revoked
  or expired (revoked at <https://myaccount.google.com/permissions>, or the 7-day Testing
  expiry) — re-authorize the connector.

---

## Development

```bash
npm run dev        # wrangler dev
npm run typecheck  # tsc --noEmit
npm run lint       # biome check
```

---

## License

MIT — see [LICENSE](LICENSE).
