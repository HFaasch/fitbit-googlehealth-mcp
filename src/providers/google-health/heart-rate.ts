import { getSampleRange } from './samples';

interface RawHeartRatePoint {
  dataSource?: { device?: { displayName?: string }; platform?: string };
  heartRate: {
    sampleTime: { physicalTime: string };
    beatsPerMinute: string;
  };
}

interface HourlyBucket {
  hour: number;
  count: number;
  minBpm: number;
  maxBpm: number;
  avgBpm: number;
}

export interface HeartRateSummary {
  date: string;
  device?: string;
  sampleCount: number;
  minBpm: number;
  maxBpm: number;
  avgBpm: number;
  hourly: HourlyBucket[];
}

/**
 * Continuous heart rate is sampled every few seconds by Fitbit, so a single
 * day can be tens of thousands of raw points (megabytes of JSON) - far too
 * much for a chat response. This fetches everything but returns only an
 * hourly-bucketed summary instead of raw samples.
 */
export async function getHeartRateSummary(
  date: string,
  accessToken: string,
): Promise<HeartRateSummary> {
  const start = `${date}T00:00:00Z`;
  const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const points = await getSampleRange<RawHeartRatePoint>(
    'heart-rate',
    'heart_rate',
    start,
    end,
    accessToken,
    40,
  );

  const buckets = new Map<number, number[]>();
  const allBpm: number[] = [];
  let device: string | undefined;

  for (const point of points) {
    const bpm = Number(point.heartRate.beatsPerMinute);
    if (!Number.isFinite(bpm)) continue;
    allBpm.push(bpm);
    device ??= point.dataSource?.device?.displayName;

    const hour = new Date(point.heartRate.sampleTime.physicalTime).getUTCHours();
    const bucket = buckets.get(hour) ?? [];
    bucket.push(bpm);
    buckets.set(hour, bucket);
  }

  const hourly: HourlyBucket[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bpms]) => ({
      hour,
      count: bpms.length,
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
      avgBpm: Math.round(bpms.reduce((sum, v) => sum + v, 0) / bpms.length),
    }));

  return {
    date,
    device,
    sampleCount: allBpm.length,
    minBpm: allBpm.length ? Math.min(...allBpm) : 0,
    maxBpm: allBpm.length ? Math.max(...allBpm) : 0,
    avgBpm: allBpm.length ? Math.round(allBpm.reduce((sum, v) => sum + v, 0) / allBpm.length) : 0,
    hourly,
  };
}
