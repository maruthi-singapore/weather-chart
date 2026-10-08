export class WeatherProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherProviderError';
  }
}

interface ForecastPayload {
  code?: number;
  errorMsg?: string;
  data?: ForecastRoot;
  area_metadata?: AreaMetadata[];
  items?: ForecastItem[];
}

interface ForecastRoot {
  area_metadata?: AreaMetadata[];
  items?: ForecastItem[];
}

interface AreaMetadata {
  name?: string;
  label_location?: {
    latitude?: number | string;
    longitude?: number | string;
  };
}

interface ForecastItem {
  update_timestamp?: string;
  timestamp?: string;
  valid_period?: {
    start?: string;
    end?: string;
    text?: string;
  };
  forecasts?: Array<{
    area?: string;
    forecast?: string;
  }>;
}

interface ReadingPayload {
  code?: number;
  errorMsg?: string;
  data?: {
    stations?: WeatherStation[];
    readings?: WeatherReading[];
    readingType?: string;
    readingUnit?: string;
  };
}

interface WeatherStation {
  id?: string;
  name?: string;
  location?: {
    latitude?: number | string;
    longitude?: number | string;
  };
}

interface WeatherReading {
  timestamp?: string;
  data?: Array<{
    stationId?: string;
    value?: number | string;
  }>;
}

interface RegionMetadata {
  name?: string;
  labelLocation?: {
    latitude?: number | string;
    longitude?: number | string;
  };
}

interface UvPayload {
  code?: number;
  errorMsg?: string;
  data?: {
    records?: Array<{
      timestamp?: string;
      updatedTimestamp?: string;
      index?: Array<{
        hour?: string;
        value?: number | string;
      }>;
    }>;
  };
}

interface PsiPayload {
  code?: number;
  errorMsg?: string;
  data?: {
    regionMetadata?: RegionMetadata[];
    items?: Array<{
      timestamp?: string;
      updatedTimestamp?: string;
      readings?: Record<
        string,
        Record<string, number | string>
      >;
    }>;
  };
}

interface TwentyFourHourPayload {
  code?: number;
  errorMsg?: string;
  data?: {
    records?: Array<{
      timestamp?: string;
      updatedTimestamp?: string;
      general?: {
        temperature?: {
          low?: number | string;
          high?: number | string;
        };
      };
      periods?: Array<{
        timePeriod?: {
          start?: string;
          text?: string;
        };
        regions?: Record<
          string,
          {
            text?: string;
            code?: string;
          }
        >;
      }>;
    }>;
  };
}

interface FourDayPayload {
  code?: number;
  errorMsg?: string;
  data?: {
    records?: Array<{
      update_timestamp?: string;
      updatedTimestamp?: string;
      timestamp?: string;
      forecasts?: FourDayForecastEntry[];
    }>;
  };
  items?: Array<{
    update_timestamp?: string;
    updatedTimestamp?: string;
    timestamp?: string;
    forecasts?: FourDayForecastEntry[];
  }>;
}

interface FourDayForecastEntry {
  date?: string;
  timestamp?: string;
  forecast?: string;
  temperature?: {
    low?: number | string;
    high?: number | string;
  };
}

export interface ForecastPeriod {
  label: string;
  forecast: string;
}

export interface DailyForecast {
  date: string;
  forecast: string;
  temperature_low_c: number | null;
  temperature_high_c: number | null;
}

export interface WeatherSnapshot {
  condition: string;
  observed_at: string;
  source: string;
  area: string | null;
  valid_period_text: string | null;
  temperature_c: number | null;
  humidity_percent: number | null;
  rainfall_mm: number | null;
  wind_speed_knots: number | null;
  wind_direction_degrees: number | null;
  forecast_low_c: number | null;
  forecast_high_c: number | null;
  uv_index: number | null;
  psi_twenty_four_hourly: number | null;
  pm25_one_hourly: number | null;
  air_quality_region: string | null;
  forecast_periods: ForecastPeriod[];
  daily_forecast: DailyForecast[];
}

interface NearestReading {
  value: number | null;
  timestamp: string | null;
}

interface AirQualityReading {
  psi: number | null;
  pm25: number | null;
  region: string | null;
  timestamp: string | null;
}

interface TwentyFourHourForecast {
  low: number | null;
  high: number | null;
  periods: ForecastPeriod[];
  timestamp: string | null;
}

interface FourDayForecast {
  days: DailyForecast[];
  timestamp: string | null;
}

export class SingaporeWeatherClient {
  constructor(
    private readonly options: {
      baseUrl?: string;
      legacyBaseUrl?: string;
      apiKey?: string;
      timeoutMs?: number;
      userAgent?: string;
    } = {},
  ) {}

  /**
   * Retrieves the two-hour forecast first because this provides
   * the condition and nearest forecast area.
   *
   * Other weather calls are made independently. If one secondary
   * endpoint fails, the remaining successful values are still returned.
   */
  async getCurrentWeather(
    latitude: number,
    longitude: number,
  ): Promise<WeatherSnapshot> {
    validateCoordinates(latitude, longitude);

    console.log('[WEATHER] Retrieving weather for:', {
      latitude,
      longitude,
    });

    /*
     * Do not catch this request and return an empty snapshot.
     * If the main forecast fails, let WeatherProviderError reach
     * locations.ts so the route can return HTTP 502.
     */
    const forecastPayload =
      await this.fetchLatestForecastPayload();

    const baseSnapshot = this.snapshotFromPayload(
      forecastPayload,
      latitude,
      longitude,
    );

    const [
      temperatureResult,
      humidityResult,
      rainfallResult,
      windSpeedResult,
      windDirectionResult,
      uvResult,
      airQualityResult,
      twentyFourHourResult,
      fourDayResult,
    ] = await Promise.allSettled([
      this.fetchNearestReading(
        'air-temperature',
        latitude,
        longitude,
      ),
      this.fetchNearestReading(
        'relative-humidity',
        latitude,
        longitude,
      ),
      this.fetchNearestReading(
        'rainfall',
        latitude,
        longitude,
      ),
      this.fetchNearestReading(
        'wind-speed',
        latitude,
        longitude,
      ),
      this.fetchNearestReading(
        'wind-direction',
        latitude,
        longitude,
      ),
      this.fetchUvIndex(),
      this.fetchAirQuality(latitude, longitude),
      this.fetchTwentyFourHourForecast(
        latitude,
        longitude,
      ),
      this.fetchFourDayForecast(),
    ]);

    logRejectedResult(
      'air-temperature',
      temperatureResult,
    );
    logRejectedResult(
      'relative-humidity',
      humidityResult,
    );
    logRejectedResult(
      'rainfall',
      rainfallResult,
    );
    logRejectedResult(
      'wind-speed',
      windSpeedResult,
    );
    logRejectedResult(
      'wind-direction',
      windDirectionResult,
    );
    logRejectedResult('uv', uvResult);
    logRejectedResult(
      'air-quality',
      airQualityResult,
    );
    logRejectedResult(
      'twenty-four-hour forecast',
      twentyFourHourResult,
    );
    logRejectedResult(
      'four-day forecast',
      fourDayResult,
    );

    const temperature =
      fulfilledValue<NearestReading>(
        temperatureResult,
      );

    const humidity =
      fulfilledValue<NearestReading>(
        humidityResult,
      );

    const rainfall =
      fulfilledValue<NearestReading>(
        rainfallResult,
      );

    const windSpeed =
      fulfilledValue<NearestReading>(
        windSpeedResult,
      );

    const windDirection =
      fulfilledValue<NearestReading>(
        windDirectionResult,
      );

    const uv =
      fulfilledValue<NearestReading>(
        uvResult,
      );

    const airQuality =
      fulfilledValue<AirQualityReading>(
        airQualityResult,
      );

    const twentyFourHour =
      fulfilledValue<TwentyFourHourForecast>(
        twentyFourHourResult,
      );

    const fourDay =
      fulfilledValue<FourDayForecast>(
        fourDayResult,
      );

    const observedAt =
      latestTimestamp([
        baseSnapshot.observed_at || null,
        temperature?.timestamp ?? null,
        humidity?.timestamp ?? null,
        rainfall?.timestamp ?? null,
        windSpeed?.timestamp ?? null,
        windDirection?.timestamp ?? null,
        uv?.timestamp ?? null,
        airQuality?.timestamp ?? null,
        twentyFourHour?.timestamp ?? null,
        fourDay?.timestamp ?? null,
      ]) ?? baseSnapshot.observed_at;

    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,

      observed_at: observedAt,

      temperature_c:
        temperature?.value ?? null,

      humidity_percent:
        humidity?.value ?? null,

      rainfall_mm:
        rainfall?.value ?? null,

      wind_speed_knots:
        windSpeed?.value ?? null,

      wind_direction_degrees:
        windDirection?.value ?? null,

      forecast_low_c:
        twentyFourHour?.low ?? null,

      forecast_high_c:
        twentyFourHour?.high ?? null,

      uv_index:
        uv?.value ?? null,

      psi_twenty_four_hourly:
        airQuality?.psi ?? null,

      pm25_one_hourly:
        airQuality?.pm25 ?? null,

      air_quality_region:
        airQuality?.region ?? null,

      forecast_periods:
        twentyFourHour?.periods ?? [],

      daily_forecast:
        fourDay?.days ?? [],
    };

    console.log(
      '[WEATHER] Final snapshot:',
      JSON.stringify(snapshot, null, 2),
    );

    return snapshot;
  }

  async fetchLatestForecastPayload():
    Promise<ForecastPayload> {
    return this.fetchJson<ForecastPayload>(
      `${this.apiBaseUrl()}/v2/real-time/api/two-hr-forecast`,
    );
  }

  async fetchNearestReading(
    endpoint:
      | 'air-temperature'
      | 'relative-humidity'
      | 'rainfall'
      | 'wind-speed'
      | 'wind-direction',
    latitude: number,
    longitude: number,
  ): Promise<NearestReading> {
    const payload =
      await this.fetchReadingPayload(endpoint);

    validateProviderPayload(
      payload.code,
      payload.errorMsg,
      endpoint,
    );

    const stations =
      payload.data?.stations ?? [];

    const readings =
      payload.data?.readings ?? [];

    const latestReading =
      readings[0];

    const values =
      latestReading?.data ?? [];

    if (
      stations.length === 0 ||
      values.length === 0
    ) {
      return {
        value: null,
        timestamp:
          latestReading?.timestamp ?? null,
      };
    }

    const valueByStation =
      new Map<string, number>();

    for (const entry of values) {
      if (!entry.stationId) {
        continue;
      }

      const value = numberOrNull(
        entry.value,
      );

      if (value !== null) {
        valueByStation.set(
          entry.stationId,
          value,
        );
      }
    }

    const station = nearestStation(
      stations,
      latitude,
      longitude,
      valueByStation,
    );

    return {
      value: station
        ? valueByStation.get(station.id) ??
          null
        : null,

      timestamp:
        latestReading?.timestamp ?? null,
    };
  }

  async fetchReadingPayload(
    endpoint: string,
  ): Promise<ReadingPayload> {
    return this.fetchJson<ReadingPayload>(
      `${this.apiBaseUrl()}/v2/real-time/api/${endpoint}`,
    );
  }

  async fetchUvIndex(): Promise<NearestReading> {
    const payload =
      await this.fetchJson<UvPayload>(
        `${this.apiBaseUrl()}/v2/real-time/api/uv`,
      );

    validateProviderPayload(
      payload.code,
      payload.errorMsg,
      'uv',
    );

    const record =
      payload.data?.records?.[0];

    const indexes =
      record?.index ?? [];

    const latestIndex =
      latestUvReading(indexes);

    return {
      value:
        numberOrNull(latestIndex?.value),

      timestamp:
        record?.updatedTimestamp ??
        latestIndex?.hour ??
        record?.timestamp ??
        null,
    };
  }

  async fetchAirQuality(
    latitude: number,
    longitude: number,
  ): Promise<AirQualityReading> {
    const [
      psiPayload,
      pm25Payload,
    ] = await Promise.all([
      this.fetchJson<PsiPayload>(
        `${this.apiBaseUrl()}/v2/real-time/api/psi`,
      ),
      this.fetchJson<PsiPayload>(
        `${this.apiBaseUrl()}/v2/real-time/api/pm25`,
      ),
    ]);

    validateProviderPayload(
      psiPayload.code,
      psiPayload.errorMsg,
      'psi',
    );

    validateProviderPayload(
      pm25Payload.code,
      pm25Payload.errorMsg,
      'pm25',
    );

    const metadata =
      psiPayload.data?.regionMetadata ??
      pm25Payload.data?.regionMetadata ??
      [];

    const region =
      nearestRegionName(
        metadata,
        latitude,
        longitude,
      ) ??
      nearestRegionName(
        defaultRegions(),
        latitude,
        longitude,
      );

    const psiItem =
      psiPayload.data?.items?.[0];

    const pm25Item =
      pm25Payload.data?.items?.[0];

    return {
      psi: valueForRegion(
        psiItem?.readings
          ?.psi_twenty_four_hourly,
        region,
      ),

      pm25: valueForRegion(
        pm25Item?.readings
          ?.pm25_one_hourly,
        region,
      ),

      region,

      timestamp: latestTimestamp([
        psiItem?.updatedTimestamp ??
          psiItem?.timestamp ??
          null,

        pm25Item?.updatedTimestamp ??
          pm25Item?.timestamp ??
          null,
      ]),
    };
  }

  async fetchTwentyFourHourForecast(
    latitude: number,
    longitude: number,
  ): Promise<TwentyFourHourForecast> {
    const payload =
      await this.fetchJson<TwentyFourHourPayload>(
        `${this.apiBaseUrl()}/v2/real-time/api/twenty-four-hr-forecast`,
      );

    validateProviderPayload(
      payload.code,
      payload.errorMsg,
      'twenty-four-hour forecast',
    );

    const record =
      payload.data?.records?.[0];

    if (!record) {
      throw new WeatherProviderError(
        'The 24-hour forecast response has no records',
      );
    }

    const region =
      nearestRegionName(
        defaultRegions(),
        latitude,
        longitude,
      ) ?? 'central';

    const periods =
      (record.periods ?? [])
        .map((period) => {
          const regionForecast =
            period.regions?.[region]
              ?.text ??
            period.regions?.central
              ?.text ??
            '';

          return {
            label:
              period.timePeriod?.text ??
              period.timePeriod?.start ??
              '',

            forecast:
              regionForecast,
          };
        })
        .filter(
          (
            period,
          ): period is ForecastPeriod =>
            Boolean(
              period.label &&
                period.forecast,
            ),
        );

    return {
      low: numberOrNull(
        record.general
          ?.temperature?.low,
      ),

      high: numberOrNull(
        record.general
          ?.temperature?.high,
      ),

      periods,

      timestamp:
        record.updatedTimestamp ??
        record.timestamp ??
        null,
    };
  }

  async fetchFourDayForecast():
    Promise<FourDayForecast> {
    const payload =
      await this.fetchJson<FourDayPayload>(
        `${this.legacyApiBaseUrl()}/v1/environment/4-day-weather-forecast`,
      );

    validateProviderPayload(
      payload.code,
      payload.errorMsg,
      'four-day forecast',
    );

    const item =
      payload.items?.[0] ??
      payload.data?.records?.[0];

    const forecasts =
      item?.forecasts ?? [];

    const days: DailyForecast[] =
      forecasts
        .map((forecast) => ({
          date:
            forecast.date ??
            forecast.timestamp ??
            '',

          forecast:
            forecast.forecast ?? '',

          temperature_low_c:
            numberOrNull(
              forecast.temperature?.low,
            ),

          temperature_high_c:
            numberOrNull(
              forecast.temperature?.high,
            ),
        }))
        .filter(
          (forecast) =>
            Boolean(
              forecast.date &&
                forecast.forecast,
            ),
        );

    return {
      days,

      timestamp:
        item?.update_timestamp ??
        item?.updatedTimestamp ??
        item?.timestamp ??
        null,
    };
  }

  private apiBaseUrl(): string {
    return (
      this.options.baseUrl ??
      'https://api-open.data.gov.sg'
    );
  }

  private legacyApiBaseUrl(): string {
    return (
      this.options.legacyBaseUrl ??
      'https://api.data.gov.sg'
    );
  }

  /**
   * Reads the response body one time as text.
   * The same text is then parsed with JSON.parse().
   *
   * Do not call response.text() and response.json()
   * on the same Response object.
   */
  private async fetchJson<T>(
    url: string,
  ): Promise<T> {
    const controller =
      new AbortController();

    const timeoutMs =
      this.options.timeoutMs ??
      8000;

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, timeoutMs);

    console.log(
      `[WEATHER API] GET ${url}`,
    );

    try {
      const response =
        await fetch(url, {
          method: 'GET',

          signal:
            controller.signal,

          headers: {
            Accept:
              'application/json',

            'User-Agent':
              this.options
                .userAgent ??
              'weather-starter/0.1 (educational project)',

            ...(this.options.apiKey
              ? {
                  'x-api-key':
                    this.options
                      .apiKey,
                }
              : {}),
          },
        });

      const contentType =
        response.headers.get(
          'content-type',
        );

      /*
       * Read the body only once.
       */
      const responseText =
        await response.text();

      console.log(
        `[WEATHER API] HTTP ${response.status}`,
      );

      console.log(
        '[WEATHER API] Content-Type:',
        contentType,
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new WeatherProviderError(
            'Weather provider rate limit reached (HTTP 429)',
          );
        }

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          throw new WeatherProviderError(
            'Weather provider rejected the request. Check the API key.',
          );
        }

        const details =
          responseText.trim()
            ? `: ${truncate(
                responseText,
                500,
              )}`
            : '';

        throw new WeatherProviderError(
          `Weather provider returned HTTP ${response.status}${details}`,
        );
      }

      if (!responseText.trim()) {
        throw new WeatherProviderError(
          'Weather provider returned an empty response',
        );
      }

      try {
        return JSON.parse(
          responseText,
        ) as T;
      } catch (error) {
        console.error(
          '[WEATHER API] Invalid JSON response:',
          truncate(
            responseText,
            1000,
          ),
        );

        throw new WeatherProviderError(
          'Weather provider returned invalid JSON',
        );
      }
    } catch (error) {
      if (
        error instanceof
        WeatherProviderError
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name === 'AbortError'
      ) {
        throw new WeatherProviderError(
          `Weather provider request timed out after ${timeoutMs} ms`,
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Unknown network error';

      throw new WeatherProviderError(
        `Unable to reach weather provider: ${message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  snapshotFromPayload(
    payload: ForecastPayload,
    latitude: number,
    longitude: number,
  ): WeatherSnapshot {
    validateProviderPayload(
      payload.code,
      payload.errorMsg,
      'two-hour forecast',
    );

    const root =
      payload.data ?? payload;

    const areaMetadata =
      root.area_metadata ?? [];

    const items =
      root.items ?? [];

    if (items.length === 0) {
      throw new WeatherProviderError(
        'Forecast response has no items',
      );
    }

    const latestItem =
      latestForecastItem(items);

    const forecasts =
      latestItem.forecasts ?? [];

    if (forecasts.length === 0) {
      throw new WeatherProviderError(
        'Forecast item has no area forecasts',
      );
    }

    const forecastByArea =
      new Map<string, string>();

    for (const forecast of forecasts) {
      const area =
        forecast.area?.trim();

      const condition =
        forecast.forecast?.trim();

      if (area && condition) {
        forecastByArea.set(
          area,
          condition,
        );
      }
    }

    const nearestArea =
      nearestAreaName(
        areaMetadata,
        latitude,
        longitude,
      );

    console.log(
      '[WEATHER] Nearest area:',
      nearestArea,
    );

    let area: string | null =
      nearestArea;

    let condition:
      | string
      | undefined;

    if (nearestArea) {
      condition =
        forecastByArea.get(
          nearestArea,
        );
    }

    /*
     * If metadata matching does not produce a forecast,
     * use the first valid forecast returned by the provider.
     */
    if (!condition) {
      const fallback =
        forecasts.find(
          (forecast) =>
            Boolean(
              forecast.area &&
                forecast.forecast,
            ),
        );

      area =
        fallback?.area ?? null;

      condition =
        fallback?.forecast;
    }

    if (!condition) {
      throw new WeatherProviderError(
        'No usable forecast was found in the provider response',
      );
    }

    const snapshot: WeatherSnapshot = {
      condition,

      observed_at:
        latestItem
          .update_timestamp ??
        latestItem.timestamp ??
        '',

      source:
        'api-open.data.gov.sg',

      area,

      valid_period_text:
        latestItem
          .valid_period?.text ??
        null,

      temperature_c: null,

      humidity_percent: null,

      rainfall_mm: null,

      wind_speed_knots: null,

      wind_direction_degrees:
        null,

      forecast_low_c: null,

      forecast_high_c: null,

      uv_index: null,

      psi_twenty_four_hourly:
        null,

      pm25_one_hourly: null,

      air_quality_region: null,

      forecast_periods: [],

      daily_forecast: [],
    };

    console.log(
      '[WEATHER] Base forecast snapshot:',
      JSON.stringify(
        snapshot,
        null,
        2,
      ),
    );

    return snapshot;
  }
}

function validateProviderPayload(
  code: number | undefined,
  errorMessage: string | undefined,
  endpoint: string,
): void {
  if (
    code !== undefined &&
    code !== 0
  ) {
    throw new WeatherProviderError(
      errorMessage ||
        `Weather provider returned an error for ${endpoint}`,
    );
  }
}

function validateCoordinates(
  latitude: number,
  longitude: number,
): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new WeatherProviderError(
      'Latitude and longitude must be valid numbers',
    );
  }
}

function nearestAreaName(
  areaMetadata: AreaMetadata[],
  latitude: number,
  longitude: number,
): string | null {
  let nearest: {
    name: string;
    distance: number;
  } | null = null;

  for (const area of areaMetadata) {
    const lat =
      numberOrNull(
        area.label_location
          ?.latitude,
      );

    const lon =
      numberOrNull(
        area.label_location
          ?.longitude,
      );

    if (
      !area.name ||
      lat === null ||
      lon === null
    ) {
      continue;
    }

    const distance =
      (lat - latitude) ** 2 +
      (lon - longitude) ** 2;

    if (
      !nearest ||
      distance < nearest.distance
    ) {
      nearest = {
        name: area.name,
        distance,
      };
    }
  }

  return nearest?.name ?? null;
}

function nearestRegionName(
  regions: RegionMetadata[],
  latitude: number,
  longitude: number,
): string | null {
  let nearest: {
    name: string;
    distance: number;
  } | null = null;

  for (const region of regions) {
    const lat =
      numberOrNull(
        region.labelLocation
          ?.latitude,
      );

    const lon =
      numberOrNull(
        region.labelLocation
          ?.longitude,
      );

    if (
      !region.name ||
      lat === null ||
      lon === null
    ) {
      continue;
    }

    const distance =
      (lat - latitude) ** 2 +
      (lon - longitude) ** 2;

    if (
      !nearest ||
      distance < nearest.distance
    ) {
      nearest = {
        name:
          region.name.toLowerCase(),
        distance,
      };
    }
  }

  return nearest?.name ?? null;
}

function nearestStation(
  stations: WeatherStation[],
  latitude: number,
  longitude: number,
  valueByStation: Map<
    string,
    number
  >,
): {
  id: string;
  distance: number;
} | null {
  let nearest: {
    id: string;
    distance: number;
  } | null = null;

  for (const station of stations) {
    const lat =
      numberOrNull(
        station.location
          ?.latitude,
      );

    const lon =
      numberOrNull(
        station.location
          ?.longitude,
      );

    if (
      !station.id ||
      lat === null ||
      lon === null ||
      !valueByStation.has(
        station.id,
      )
    ) {
      continue;
    }

    const distance =
      (lat - latitude) ** 2 +
      (lon - longitude) ** 2;

    if (
      !nearest ||
      distance < nearest.distance
    ) {
      nearest = {
        id: station.id,
        distance,
      };
    }
  }

  return nearest;
}

function latestForecastItem(
  items: ForecastItem[],
): ForecastItem {
  return (
    [...items].sort((left, right) => {
      const leftTimestamp =
        parseTimestamp(
          left.update_timestamp ??
            left.timestamp,
        );

      const rightTimestamp =
        parseTimestamp(
          right.update_timestamp ??
            right.timestamp,
        );

      return (
        rightTimestamp -
        leftTimestamp
      );
    })[0] ?? items[0]
  );
}

function latestUvReading(
  indexes: Array<{
    hour?: string;
    value?: number | string;
  }>,
): {
  hour?: string;
  value?: number | string;
} | undefined {
  return [...indexes].sort(
    (left, right) =>
      parseTimestamp(right.hour) -
      parseTimestamp(left.hour),
  )[0];
}

function latestTimestamp(
  timestamps:
    Array<string | null>,
): string | null {
  const validTimestamps =
    timestamps.filter(
      (
        timestamp,
      ): timestamp is string =>
        Boolean(
          timestamp &&
            Number.isFinite(
              new Date(
                timestamp,
              ).getTime(),
            ),
        ),
    );

  if (
    validTimestamps.length === 0
  ) {
    return null;
  }

  return (
    [...validTimestamps].sort(
      (left, right) =>
        new Date(right).getTime() -
        new Date(left).getTime(),
    )[0] ?? null
  );
}

function parseTimestamp(
  timestamp:
    | string
    | undefined,
): number {
  if (!timestamp) {
    return 0;
  }

  const parsed =
    new Date(timestamp).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function numberOrNull(
  value:
    | number
    | string
    | null
    | undefined,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function valueForRegion(
  values:
    | Record<
        string,
        number | string
      >
    | undefined,
  region: string | null,
): number | null {
  if (!values || !region) {
    return null;
  }

  const exactValue =
    values[region];

  if (
    exactValue !== undefined
  ) {
    return numberOrNull(
      exactValue,
    );
  }

  const matchingKey =
    Object.keys(values).find(
      (key) =>
        key.toLowerCase() ===
        region.toLowerCase(),
    );

  return matchingKey
    ? numberOrNull(
        values[matchingKey],
      )
    : null;
}

function defaultRegions():
  RegionMetadata[] {
  return [
    {
      name: 'west',
      labelLocation: {
        latitude: 1.35735,
        longitude: 103.7,
      },
    },
    {
      name: 'north',
      labelLocation: {
        latitude: 1.41803,
        longitude: 103.82,
      },
    },
    {
      name: 'central',
      labelLocation: {
        latitude: 1.35735,
        longitude: 103.82,
      },
    },
    {
      name: 'south',
      labelLocation: {
        latitude: 1.29587,
        longitude: 103.82,
      },
    },
    {
      name: 'east',
      labelLocation: {
        latitude: 1.35735,
        longitude: 103.94,
      },
    },
  ];
}

function fulfilledValue<T>(
  result: PromiseSettledResult<T>,
): T | null {
  return result.status ===
    'fulfilled'
    ? result.value
    : null;
}

function logRejectedResult<T>(
  name: string,
  result:
    PromiseSettledResult<T>,
): void {
  if (
    result.status ===
    'rejected'
  ) {
    console.warn(
      `[WEATHER] ${name} request failed:`,
      result.reason,
    );
  }
}

function truncate(
  value: string,
  maximumLength: number,
): string {
  if (
    value.length <=
    maximumLength
  ) {
    return value;
  }

  return `${value.substring(
    0,
    maximumLength,
  )}...`;
}