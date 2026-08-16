import { listAllDataPoints } from './client';

export interface SleepDataPoint {
  interval: {
    startTime: string;
    endTime: string;
    startUtcOffset?: string;
    endUtcOffset?: string;
  };
  type?: 'CLASSIC' | 'STAGES';
  stages?: Array<{ type: string; interval: { startTime: string; endTime: string } }>;
  outOfBedSegments?: Array<{ startTime: string; endTime: string }>;
  summary?: {
    minutesAsleep?: number;
    minutesAwake?: number;
    minutesInSleepPeriod?: number;
  };
  createTime?: string;
  updateTime?: string;
}

/** start/end are RFC3339 timestamps, e.g. "2026-08-01T00:00:00Z". */
export async function getSleepRange(
  start: string,
  end: string,
  accessToken: string,
): Promise<SleepDataPoint[]> {
  const filter = `sleep.interval.start_time >= "${start}" AND sleep.interval.start_time < "${end}"`;
  return listAllDataPoints<SleepDataPoint>('sleep', filter, accessToken);
}
