import type { CreateLocationPayload, Location } from './types';

const API_BASE = '/api';

interface LocationsResponse {
  locations: Location[];
}

interface ApiError {
  detail?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...options.headers,
    },
    ...options,
  });

  console.log(
    `[API] ${options.method ?? 'GET'} ${endpoint} -> ${response.status}`,
  );

  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({}))) as ApiError;

    throw new Error(
      error.detail ??
      `Request failed with HTTP ${response.status}`,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  const data = (await response.json()) as T;

  console.log(`[API RESPONSE] ${endpoint}`, data);

  return data;
}

export async function listLocations(): Promise<LocationsResponse> {
  return request<LocationsResponse>(
    `/locations?t=${Date.now()}`,
  );
}

export async function createLocation(
  payload: CreateLocationPayload,
): Promise<Location> {
  return request<Location>('/locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function refreshLocation(
  id: number,
): Promise<Location> {
  const location = await request<Location>(
    `/locations/${id}/refresh`,
    {
      method: 'POST',
    },
  );

  console.log(
    'REFRESH RESPONSE:',
    JSON.stringify(location, null, 2),
  );

  console.log(
    'REFRESH WEATHER:',
    JSON.stringify(
      (location as any)?.weather,
      null,
      2,
    ),
  );

  return location;
}

export function logInteraction(
  event: string,
  metadata: object = {},
): void {
  const page =
    typeof window === 'undefined'
      ? undefined
      : window.location.pathname;

  void fetch(`${API_BASE}/logs`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event,
      metadata,
      page,
    }),
    keepalive: true,
  }).catch((error) => {
    console.warn(
      'Failed to submit interaction log:',
      error,
    );
  });
}