/**
 * Google Health MCP Server - Cloudflare Worker
 *
 * Uses @cloudflare/workers-oauth-provider directly (no Durable Objects / agents
 * package) - a fresh McpServer + StreamableHTTP transport is built per request,
 * with the caller's Google refresh token available via ctx.props.
 */

import { StreamableHTTPTransport } from '@hono/mcp';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { z } from 'zod';
import { AuthHandler } from './auth/handler';
import { getHeartRateSummary } from './providers/google-health/heart-rate';
import { DAILY_METRICS, getDailyMetricRange } from './providers/google-health/metrics';
import { refreshAccessToken } from './providers/google-health/oauth';
import { getSampleRange } from './providers/google-health/samples';
import { getSleepRange, summarizeSleepPoint } from './providers/google-health/sleep';
import type { Env, Props } from './types';

export { Env, Props };

function buildServer(accessToken: string): McpServer {
  const server = new McpServer({ name: 'Google Health', version: '1.0.0' });

  server.tool(
    'get_sleep',
    'Get sleep data (stages, duration, efficiency) for a single night. Date is interpreted as UTC.',
    { date: z.string().describe('Date in YYYY-MM-DD format (UTC)') },
    async ({ date }) => {
      try {
        const start = `${date}T00:00:00Z`;
        const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
        const result = await getSleepRange(start, end, accessToken);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_sleep_range',
    'Get a compact per-night sleep summary for a date range (UTC): duration, efficiency, stage minutes, and awakening count per night. For the full stage-by-stage breakdown of one night, use get_sleep.',
    {
      from: z.string().describe('Start date (YYYY-MM-DD, UTC, inclusive)'),
      to: z.string().describe('End date (YYYY-MM-DD, UTC, exclusive)'),
    },
    async ({ from, to }) => {
      try {
        const result = await getSleepRange(`${from}T00:00:00Z`, `${to}T00:00:00Z`, accessToken);
        const summaries = result.map(summarizeSleepPoint);
        return { content: [{ type: 'text' as const, text: JSON.stringify(summaries, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_daily_metrics',
    'Get a daily health metric over a date range: respiratory rate, SpO2, resting heart rate, heart rate variability, skin temperature deviation, or daily heart rate zones.',
    {
      metric: z.enum(Object.keys(DAILY_METRICS) as [string, ...string[]]).describe('Which metric to fetch'),
      from: z.string().describe('Start date (YYYY-MM-DD, inclusive)'),
      to: z.string().describe('End date (YYYY-MM-DD, exclusive)'),
    },
    async ({ metric, from, to }) => {
      try {
        const result = await getDailyMetricRange(
          metric as keyof typeof DAILY_METRICS,
          from,
          to,
          accessToken,
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_weight_range',
    'Get weight measurements for a date range (UTC).',
    {
      from: z.string().describe('Start date (YYYY-MM-DD, UTC, inclusive)'),
      to: z.string().describe('End date (YYYY-MM-DD, UTC, exclusive)'),
    },
    async ({ from, to }) => {
      try {
        const result = await getSampleRange(
          'weight',
          'weight',
          `${from}T00:00:00Z`,
          `${to}T00:00:00Z`,
          accessToken,
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_body_fat_range',
    'Get body fat percentage measurements for a date range (UTC).',
    {
      from: z.string().describe('Start date (YYYY-MM-DD, UTC, inclusive)'),
      to: z.string().describe('End date (YYYY-MM-DD, UTC, exclusive)'),
    },
    async ({ from, to }) => {
      try {
        const result = await getSampleRange(
          'body-fat',
          'body_fat',
          `${from}T00:00:00Z`,
          `${to}T00:00:00Z`,
          accessToken,
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'get_heart_rate',
    'Get an hourly-bucketed heart rate summary (min/max/avg per hour, plus daily overview) for a single day (UTC). Fitbit samples every few seconds, so raw data is returned pre-aggregated to stay compact.',
    { date: z.string().describe('Date in YYYY-MM-DD format (UTC)') },
    async ({ date }) => {
      try {
        const result = await getHeartRateSummary(date, accessToken);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export class McpApiHandler extends WorkerEntrypoint<Env, Props> {
  async fetch(request: Request): Promise<Response> {
    if (!this.ctx.props?.googleRefreshToken) {
      return new Response('Missing Google authorization', { status: 401 });
    }

    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(this.ctx.props.googleRefreshToken, this.env);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 401 });
    }

    const app = new Hono();
    app.all('*', async (c) => {
      const server = buildServer(accessToken);
      const transport = new StreamableHTTPTransport();
      await server.connect(transport);
      const response = await transport.handleRequest(c);
      return response ?? c.text('', 200);
    });

    return app.fetch(request, this.env, this.ctx);
  }
}

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: McpApiHandler,
  defaultHandler: AuthHandler as any,

  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});
