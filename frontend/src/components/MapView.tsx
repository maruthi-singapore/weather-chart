import { useEffect, useMemo, useState } from 'react';
import { DomEvent, divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../state/store';
import { formatTemperature, formatTime } from './format';
import { CloseIcon, LocationIcon, RefreshIcon } from './icons';
import type { Location } from '../types';

const SINGAPORE_CENTER: [number, number] = [1.3521, 103.8198];
// Looser than the add bounds so the island is comfortably in view.
const VIEW_BOUNDS: [[number, number], [number, number]] = [
  [1.0, 103.5],
  [1.6, 104.2],
];

// Mirrors the check in POST /locations (backend/src/routes/locations.ts).
function isInsideSingapore(latitude: number, longitude: number): boolean {
  return 1.1 <= latitude && latitude <= 1.5 && 103.6 <= longitude && longitude <= 104.1;
}

interface ClickToAddProps {
  onPick: (latitude: number, longitude: number) => void;
}

function ClickToAdd({ onPick }: ClickToAddProps) {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng),
  });

  return null;
}

interface WeatherPinProps {
  location: Location;
  isSelected: boolean;
  isHome: boolean;
  isRefreshing: boolean;
  onSelect: (id: number) => void;
  onRefresh: (id: number) => void;
}

function WeatherPin({
  location,
  isSelected,
  isHome,
  isRefreshing,
  onSelect,
  onRefresh,
}: WeatherPinProps) {
  const { weather } = location;
  const temperature = formatTemperature(weather.temperature_c);
  const high = formatTemperature(weather.forecast_high_c);
  const low = formatTemperature(weather.forecast_low_c);
  const area = weather.area || `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
  const observed = formatTime(weather.observed_at);

  // Rebuild the icon only when its visible state changes, not on every render.
  const icon = useMemo(
    () =>
      divIcon({
        className: 'weather-pin',
        html: `<div class="whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums shadow-lg backdrop-blur-xl ${
          isSelected
            ? 'border-white bg-white text-slate-900'
            : 'border-white/40 bg-slate-900/70 text-white'
        }">${temperature}</div>`,
        iconSize: [64, 28],
        iconAnchor: [32, 14],
        popupAnchor: [0, -14],
      }),
    [temperature, isSelected],
  );

  return (
    <Marker
      position={[location.latitude, location.longitude]}
      icon={icon}
      eventHandlers={{
        click: (event) => {
          // Keep a pin tap from also reaching the map's click-to-add handler.
          DomEvent.stopPropagation(event);
          onSelect(location.id);
        },
      }}
    >
      <Popup>
        <div className="w-52 text-slate-900">
          {isHome && (
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <LocationIcon className="h-3 w-3" />
              <span>Home</span>
            </div>
          )}
          <div className="text-base font-semibold leading-tight">{area}</div>
          {observed && <div className="text-[11px] text-slate-500">Updated {observed}</div>}
          <div className="mt-1 flex items-end justify-between gap-2">
            <div className="text-3xl font-light tabular-nums">{temperature}</div>
            <div className="pb-1 text-right text-xs text-slate-600">
              <div>{weather.condition || 'Conditions unavailable'}</div>
              <div className="tabular-nums">
                H:{high} L:{low}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRefresh(location.id)}
            disabled={isRefreshing}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

interface MapViewProps {
  onClose: () => void;
}

export function MapView({ onClose }: MapViewProps) {
  const { locations, selectedId, refreshingId, select, create, refresh } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const addAt = async (latitude: number, longitude: number) => {
    if (isSubmitting) return;

    if (!isInsideSingapore(latitude, longitude)) {
      setIsError(true);
      setMessage('Tap inside Singapore to add a location.');
      return;
    }

    setIsSubmitting(true);
    setIsError(false);
    setMessage(null);

    try {
      await create({ latitude, longitude });
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : 'Could not add location');
    } finally {
      setIsSubmitting(false);
    }
  };

  const status = isSubmitting
    ? 'Adding location…'
    : message ?? 'Tap anywhere in Singapore to add a location';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <MapContainer
        center={SINGAPORE_CENTER}
        zoom={11}
        minZoom={10}
        maxBounds={VIEW_BOUNDS}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ClickToAdd onPick={addAt} />
        {locations.map((location, index) => (
          <WeatherPin
            key={location.id}
            location={location}
            isSelected={selectedId === location.id}
            isHome={index === 0}
            isRefreshing={refreshingId === location.id}
            onSelect={select}
            onRefresh={refresh}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-4 top-4 z-[1100] flex items-start justify-between gap-3">
        <div
          className={`pointer-events-auto rounded-2xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-2xl ${
            isError
              ? 'border-red-300/30 bg-red-500/25 text-red-50'
              : 'border-white/15 bg-black/40 text-white/90'
          }`}
        >
          {status}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 shadow-lg backdrop-blur-2xl hover:bg-black/60"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
