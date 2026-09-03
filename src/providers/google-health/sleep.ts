import { listAllDataPoints } from './client';

interface TimeRange {
  startTime: string;
  startUtcOffset?: string;
  endTime: string;
  endUtcOffset?: string;
}

export interface SleepDataPoint {
  name: string;
  dataSource?: {
    recordingMethod?: string;
    device?: { displayName?: string };
    platform?: string;
  };
  sleep: {
    interval: TimeRange;
    type?: 'CLASSIC' | 'STAGES';
    stages?: Array<TimeRange & { type: string }>;
    outOfBedSegments?: TimeRange[];
    summary?: {
      minutesAsleep?: number;
      minutesAwake?: number;
      minutesInSleepPeriod?: number;
    };
  };
  createTime?: string;
  updateTime?: string;
}

/**
 * start/end are RFC3339 timestamps, e.g. "2026-08-01T00:00:00Z".
 * Filters on interval.end_time (not start_time - the API rejects filtering by
 * start_time for the sleep data type with INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER).
 */
export async function getSleepRange(
  start: string,
  end: string,
  accessToken: string,
): Promise<SleepDataPoint[]> {
  const filter = `sleep.interval.end_time >= "${start}" AND sleep.interval.end_time < "${end}"`;
  return listAllDataPoints<SleepDataPoint>('sleep', filter, accessToken);
}

export interface SleepNightSummary {
  /** Local calendar date the sleep ended on (YYYY-MM-DD). */
  date: string;
  device?: string;
  recordingMethod?: string;
  type?: string;
  mainSleep?: boolean;
  start: string;
  end: string;
  minutesInBed?: number;
  minutesAsleep?: number;
  minutesAwake?: number;
  minutesToFallAsleep?: number;
  efficiencyPct?: number;
  /** Minutes per stage (AWAKE / LIGHT / DEEP / REM), from the API summary or derived from the stage list. */
  stageMinutes: Record<string, number>;
  awakenings?: number;
}

function localDateFromUtc(isoUtc: string, utcOffset?: string): string {
  const offsetSec = utcOffset ? Number.parseInt(utcOffset, 10) || 0 : 0;
  return new Date(new Date(isoUtc).getTime() + offsetSec * 1000).toISOString().slice(0, 10);
}

/**
 * Collapses a raw sleep data point to a compact per-night summary. Raw points
 * carry the full stage-transition list plus every micro-awakening, which is
 * ~10 KB/night - a week of that overflows a chat response. get_sleep (single
 * night) still returns the raw point; ranges use this.
 */
export function summarizeSleepPoint(point: SleepDataPoint): SleepNightSummary {
  const s = point.sleep;
  const iv = s.interval;
  // The live API carries more than the typed shape (summary counts, stagesSummary,
  // metadata, shortAwakenings), so read those defensively.
  const raw = s as unknown as {
    summary?: {
      minutesInSleepPeriod?: string | number;
      minutesAsleep?: string | number;
      minutesAwake?: string | number;
      minutesToFallAsleep?: string | number;
      stagesSummary?: Array<{ type: string; minutes: string | number }>;
    };
    metadata?: { mainSleep?: boolean };
    shortAwakenings?: unknown[];
  };
  const num = (v: string | number | undefined): number | undefined =>
    v == null || v === '' ? undefined : Number(v);

  const stageMinutes: Record<string, number> = {};
  if (raw.summary?.stagesSummary?.length) {
    for (const st of raw.summary.stagesSummary) stageMinutes[st.type] = Number(st.minutes);
  } else if (s.stages?.length) {
    for (const st of s.stages) {
      const mins = (new Date(st.endTime).getTime() - new Date(st.startTime).getTime()) / 60000;
      stageMinutes[st.type] = Math.round((stageMinutes[st.type] ?? 0) + mins);
    }
  }

  const minutesAsleep = num(raw.summary?.minutesAsleep);
  const minutesInBed = num(raw.summary?.minutesInSleepPeriod);
  const efficiencyPct =
    minutesAsleep != null && minutesInBed
      ? Math.round((minutesAsleep / minutesInBed) * 100)
      : undefined;

  return {
    date: localDateFromUtc(iv.endTime, iv.endUtcOffset),
    device: point.dataSource?.device?.displayName,
    recordingMethod: point.dataSource?.recordingMethod,
    type: s.type,
    mainSleep: raw.metadata?.mainSleep,
    start: iv.startTime,
    end: iv.endTime,
    minutesInBed,
    minutesAsleep,
    minutesAwake: num(raw.summary?.minutesAwake),
    minutesToFallAsleep: num(raw.summary?.minutesToFallAsleep),
    efficiencyPct,
    stageMinutes,
    awakenings: Array.isArray(raw.shortAwakenings) ? raw.shortAwakenings.length : undefined,
  };
}
