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
