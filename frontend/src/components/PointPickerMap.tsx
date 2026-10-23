import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const pointMarkerIcon = L.divIcon({
  className: 'route-marker-icon',
  html: '<span class="route-marker-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const DEFAULT_CENTER: LatLngExpression = [1.3521, 103.8198];
const DEFAULT_ZOOM = 12;

export function PointPickerMap({
  value,
  onChange,
  height = '320px',
  className = '',
}: {
  value: [number, number] | null;
  onChange: (lat: number, lng: number) => void;
  height?: string;
  className?: string;
}) {
  function ClickHandler() {
    useMapEvents({
      click(e) {
        onChange(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  return (
    <div
      className={`route-map-container ${className}`}
      style={{ height }}
      aria-label="Map: click to set observation location"
    >
      <MapContainer
        center={value ?? DEFAULT_CENTER}
        zoom={value ? 15 : DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {value && <Marker position={value as LatLngExpression} icon={pointMarkerIcon} />}
        <ClickHandler />
      </MapContainer>
    </div>
  );
}

