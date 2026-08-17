import { listAllDataPoints } from './client';

/**
 * Generic reader for "Sample" record-type data (point-in-time measurements:
 * weight, body fat, heart rate, ...), filtered by sample_time.physical_time.
 * start/end are RFC3339 timestamps.
 */
export async function getSampleRange<T>(
  dataType: string,
  filterName: string,
  start: string,
  end: string,
  accessToken: string,
  maxPages = 6,
): Promise<T[]> {
  const filter = `${filterName}.sample_time.physical_time >= "${start}" AND ${filterName}.sample_time.physical_time < "${end}"`;
  return listAllDataPoints<T>(dataType, filter, accessToken, maxPages);
}
