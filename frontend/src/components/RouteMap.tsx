import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import { useEffect } from 'react';

import 'leaflet/dist/leaflet.css';

// Simple circle icon so we don't rely on Leaflet's default image paths (broken in bundlers)
const routeMarkerIcon = L.divIcon({
  className: 'route-marker-icon',
  html: '<span class="route-marker-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
const DEFAULT_CENTER: LatLngExpression = [1.3521, 103.8198];
const DEFAULT_ZOOM = 12;

export type RouteCoordinates = [number, number][];

export interface RouteMapProps {
  /** Route as [lat, lng][] — shown as polyline and (when editable) as markers */
  route: RouteCoordinates;
  /** If true, clicking the map adds a waypoint and onRouteChange is called */
  editable?: boolean;
  /** Called when user adds a point (editable mode only) */
  onRouteChange?: (route: RouteCoordinates) => void;
  height?: string;
  className?: string;
  /** When true, fit map bounds to show the whole route when route has 2+ points */
  fitBounds?: boolean;
}

function MapClickHandler({
  onAddPoint,
}: {
  onAddPoint: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onAddPoint(lat, lng);
    },
  });
  return null;
}

function FitBounds({ route }: { route: RouteCoordinates }) {
  const map = useMap();
  useEffect(() => {
    if (route.length < 2) return;
    void import('leaflet').then((L) => {
      const bounds = L.latLngBounds(route as LatLngExpression[]);
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    });
  }, [map, route]);
  return null;
}

export function RouteMap({
  route,
  editable = false,
  onRouteChange,
  height = '400px',
  className = '',
  fitBounds = true,
}: RouteMapProps) {
  const positions: LatLngExpression[] = route.map(([lat, lng]) => [lat, lng]);

  const handleAddPoint = (lat: number, lng: number) => {
    if (!editable || !onRouteChange) return;
    onRouteChange([...route, [lat, lng]]);
  };

  return (
    <div
      className={`route-map-container ${className}`}
      style={{ height }}
      aria-label={editable ? 'Map: click to add route waypoints' : 'Route map'}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {route.length >= 2 && (
          <Polyline
            positions={positions}
            color="var(--primary-green, #2d5a27)"
            weight={4}
          />
        )}
        {editable &&
          route.map((point, index) => (
            <Marker
              key={index}
              position={point as LatLngExpression}
              icon={routeMarkerIcon}
            />
          ))}
        {!editable &&
          route.length >= 1 &&
          route.map((point, index) => (
            <Marker
              key={index}
              position={point as LatLngExpression}
              icon={routeMarkerIcon}
            />
          ))}
        {editable && <MapClickHandler onAddPoint={handleAddPoint} />}
        {fitBounds && route.length >= 2 && <FitBounds route={route} />}
      </MapContainer>
    </div>
  );
}
