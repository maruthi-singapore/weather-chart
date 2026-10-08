import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  listLocations,
  createLocation,
  refreshLocation,
  logInteraction,
} from '../api';

import type {
  CreateLocationPayload,
  Location,
  ProviderProps,
  StoreValue,
} from '../types';

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: ProviderProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  /**
   * Loads all locations from the backend.
   * This is used during the initial page load and after creating a location.
   */
  const load = useCallback(async (): Promise<Location[]> => {
    setIsLoading(true);

    try {
      const data = await listLocations();
      const nextLocations = Array.isArray(data.locations)
        ? data.locations
        : [];

      console.log(
        '[STORE] Locations loaded:',
        JSON.stringify(nextLocations, null, 2),
      );

      setLocations(nextLocations);
      setError(null);

      return nextLocations;
    } catch (err) {
      console.error('[STORE] Unable to load locations:', err);

      setError(err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Loads locations when StoreProvider is mounted.
   */
  useEffect(() => {
    let active = true;

    void load().then((nextLocations) => {
      if (!active || nextLocations.length === 0) {
        return;
      }

      setSelectedId((currentSelectedId) => {
        if (
          currentSelectedId !== null &&
          nextLocations.some(
            (location) => location.id === currentSelectedId,
          )
        ) {
          return currentSelectedId;
        }

        return nextLocations[0].id;
      });
    });

    return () => {
      active = false;
    };
  }, [load]);

  /**
   * Ensures selectedId always refers to an existing location.
   */
  const effectiveSelectedId = useMemo<number | null>(() => {
    if (locations.length === 0) {
      return null;
    }

    const selectedLocationExists =
      selectedId !== null &&
      locations.some(
        (location) => location.id === selectedId,
      );

    return selectedLocationExists
      ? selectedId
      : locations[0].id;
  }, [locations, selectedId]);

  /**
   * Creates a new location and then reloads the location list.
   */
  const create = useCallback(
    async (payload: CreateLocationPayload): Promise<void> => {
      setError(null);

      logInteraction('location_create_submitted', payload);

      try {
        const createdLocation = await createLocation(payload);

        console.log(
          '[STORE] Location created:',
          JSON.stringify(createdLocation, null, 2),
        );

        const nextLocations = await load();

        const targetId =
          createdLocation?.id ??
          nextLocations[nextLocations.length - 1]?.id ??
          null;

        if (targetId !== null) {
          setSelectedId(targetId);
        }

        setIsAdding(false);

        logInteraction('location_created', {
          locationId: targetId,
          latitude: createdLocation.latitude,
          longitude: createdLocation.longitude,
        });
      } catch (err) {
        console.error('[STORE] Location creation failed:', err);

        setError(err);

        logInteraction('location_create_failed', {
          latitude: payload.latitude,
          longitude: payload.longitude,
          error:
            err instanceof Error
              ? err.message
              : 'Unknown error',
        });

        throw err;
      }
    },
    [load],
  );

  /**
   * Refreshes one location and updates that location directly
   * in React state using the POST response.
   */
  const refresh = useCallback(
    async (id: number): Promise<void> => {
      setRefreshingId(id);
      setError(null);

      logInteraction('location_refresh_clicked', {
        locationId: id,
      });

      try {
        const updatedLocation = await refreshLocation(id);

        console.log(
          '[STORE] Refresh response:',
          JSON.stringify(updatedLocation, null, 2),
        );

        console.log(
          '[STORE] Refreshed weather:',
          JSON.stringify(updatedLocation?.weather, null, 2),
        );

        if (!updatedLocation) {
          throw new Error(
            'Refresh completed, but the backend returned no location data',
          );
        }

        if (updatedLocation.id === undefined || updatedLocation.id === null) {
          throw new Error(
            'Refresh response does not contain a location ID',
          );
        }

        setLocations((currentLocations) => {
          const locationExists = currentLocations.some(
            (location) => location.id === id,
          );

          if (!locationExists) {
            console.warn(
              `[STORE] Location ${id} was not found in the current state. Adding the refreshed location.`,
            );

            return [...currentLocations, updatedLocation];
          }

          return currentLocations.map((location) =>
            location.id === id
              ? updatedLocation
              : location,
          );
        });

        setSelectedId(id);

        logInteraction('location_refreshed', {
          locationId: id,
        });
      } catch (err) {
        console.error('[STORE] Location refresh failed:', err);

        setError(err);

        logInteraction('location_refresh_failed', {
          locationId: id,
          error:
            err instanceof Error
              ? err.message
              : 'Unknown error',
        });
      } finally {
        setRefreshingId(null);
      }
    },
    [],
  );

  const select = useCallback((id: number | null): void => {
    setSelectedId(id);
  }, []);

  const setAdding = useCallback(
    (nextIsAdding: boolean): void => {
      setIsAdding(nextIsAdding);

      if (nextIsAdding) {
        logInteraction('location_form_opened');
      }
    },
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      locations,
      selectedId: effectiveSelectedId,
      isAdding,
      isLoading,
      refreshingId,
      error,
      select,
      setAdding,
      create,
      refresh,
    }),
    [
      locations,
      effectiveSelectedId,
      isAdding,
      isLoading,
      refreshingId,
      error,
      select,
      setAdding,
      create,
      refresh,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error(
      'useStore must be used inside StoreProvider',
    );
  }

  return context;
}

export function useSelectedLocation(): Location | null {
  const { locations, selectedId } = useStore();

  if (selectedId === null) {
    return null;
  }

  return (
    locations.find(
      (location) => location.id === selectedId,
    ) ?? null
  );
}