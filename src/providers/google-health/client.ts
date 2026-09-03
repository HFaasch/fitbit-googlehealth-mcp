import { DEFAULT_TIMEOUT, HEALTH_API_BASE } from '../../constants';

export interface DataPointsPage<T> {
  dataPoints: T[];
  nextPageToken?: string;
}

/**
 * Calls users/me/dataTypes/{dataType}/dataPoints with an AIP-160 filter expression.
 * https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list
 */
export async function listDataPoints<T>(
  dataType: string,
  filter: string,
  accessToken: string,
  pageToken?: string,
  pageSize = 1000,
): Promise<DataPointsPage<T>> {
  const url = new URL(`${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints`);
  url.searchParams.set('filter', filter);
  // Without pageSize the API returns only 50 points per page (AIP-158 default),
  // which silently truncates high-frequency data types (e.g. continuous heart
  // rate) once maxPages is hit. 1000 is the documented maximum.
  url.searchParams.set('pageSize', String(pageSize));
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Health API ${response.status} at ${dataType}: ${body.slice(0, 500)}`);
  }

  return (await response.json()) as DataPointsPage<T>;
}

export interface PagedResult<T> {
  dataPoints: T[];
  /** True when maxPages was hit before the API ran out of pages (result is incomplete). */
  truncated: boolean;
}

/** Follows nextPageToken until exhausted or maxPages reached (safety cap for wide date ranges). */
export async function listAllDataPoints<T>(
  dataType: string,
  filter: string,
  accessToken: string,
  maxPages = 6,
  pageSize = 1000,
): Promise<T[]> {
  return (await listAllDataPointsPaged<T>(dataType, filter, accessToken, maxPages, pageSize))
    .dataPoints;
}

/** Same as listAllDataPoints but also reports whether the maxPages cap truncated the result. */
export async function listAllDataPointsPaged<T>(
  dataType: string,
  filter: string,
  accessToken: string,
  maxPages = 6,
  pageSize = 1000,
): Promise<PagedResult<T>> {
  const results: T[] = [];
  let pageToken: string | undefined;
  let truncated = false;
  for (let i = 0; i < maxPages; i++) {
    const page = await listDataPoints<T>(dataType, filter, accessToken, pageToken, pageSize);
    results.push(...page.dataPoints);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
    if (i === maxPages - 1) truncated = true;
  }
  return { dataPoints: results, truncated };
}
