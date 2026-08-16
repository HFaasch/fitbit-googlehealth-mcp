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
): Promise<DataPointsPage<T>> {
  const url = new URL(`${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints`);
  url.searchParams.set('filter', filter);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Health API ${response.status} at ${dataType}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as DataPointsPage<T>;
}

/** Follows nextPageToken until exhausted or maxPages reached (safety cap for wide date ranges). */
export async function listAllDataPoints<T>(
  dataType: string,
  filter: string,
  accessToken: string,
  maxPages = 6,
): Promise<T[]> {
  const results: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await listDataPoints<T>(dataType, filter, accessToken, pageToken);
    results.push(...page.dataPoints);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return results;
}
