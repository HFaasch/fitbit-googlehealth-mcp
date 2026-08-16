import { listAllDataPoints } from './client';

export const DAILY_METRICS = {
  respiratory_rate: { dataType: 'daily-respiratory-rate', filterName: 'daily_respiratory_rate' },
  oxygen_saturation: {
    dataType: 'daily-oxygen-saturation',
    filterName: 'daily_oxygen_saturation',
  },
  resting_heart_rate: {
    dataType: 'daily-resting-heart-rate',
    filterName: 'daily_resting_heart_rate',
  },
  heart_rate_variability: {
    dataType: 'daily-heart-rate-variability',
    filterName: 'daily_heart_rate_variability',
  },
  skin_temperature: {
    dataType: 'daily-sleep-temperature-derivations',
    filterName: 'daily_sleep_temperature_derivations',
  },
} as const;

export type DailyMetricKey = keyof typeof DAILY_METRICS;

/** from/to are civil dates, e.g. "2026-08-01". */
export async function getDailyMetricRange(
  metric: DailyMetricKey,
  from: string,
  to: string,
  accessToken: string,
): Promise<unknown[]> {
  const { dataType, filterName } = DAILY_METRICS[metric];
  const filter = `${filterName}.date >= "${from}" AND ${filterName}.date < "${to}"`;
  return listAllDataPoints(dataType, filter, accessToken);
}
