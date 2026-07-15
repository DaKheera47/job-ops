import "leaflet/dist/leaflet.css";

import { divIcon, type LeafletMouseEvent } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

export type MapPoint = { latitude: number; longitude: number };

interface LocationRadiusMapProps {
  center: MapPoint | null;
  country: string;
  radiusMiles: number;
  onCenterChange: (center: MapPoint) => void;
  onRadiusChange: (radiusMiles: number) => void;
  onViewportCenterChange: (center: MapPoint) => void;
}

const centreIcon = divIcon({ className: "jobops-map-pin", iconSize: [20, 20] });
const radiusIcon = divIcon({
  className: "jobops-map-radius-handle",
  iconSize: [16, 16],
});

function initialView(country: string): {
  center: [number, number];
  zoom: number;
} {
  if (country === "united kingdom") return { center: [54.5, -3], zoom: 5 };
  if (country === "united states") return { center: [39, -98], zoom: 4 };
  return { center: [20, 0], zoom: 2 };
}

function MapEvents({
  onCenterChange,
  onViewportCenterChange,
}: Pick<LocationRadiusMapProps, "onCenterChange" | "onViewportCenterChange">) {
  const map = useMapEvents({
    click(event: LeafletMouseEvent) {
      onCenterChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
    moveend() {
      const center = map.getCenter();
      onViewportCenterChange({
        latitude: center.lat,
        longitude: center.lng,
      });
    },
  });
  return null;
}

function Recenter({ center }: { center: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.panTo([center.latitude, center.longitude]);
  }, [center, map]);
  return null;
}

function CountryView({
  country,
  hasCenter,
}: {
  country: string;
  hasCenter: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (hasCenter) return;
    const view = initialView(country);
    map.setView(view.center, view.zoom);
  }, [country, hasCenter, map]);
  return null;
}

function RadiusHandle({
  center,
  position,
  onRadiusChange,
}: {
  center: MapPoint;
  position: [number, number];
  onRadiusChange: (radiusMiles: number) => void;
}) {
  const map = useMap();
  return (
    <Marker
      position={position}
      icon={radiusIcon}
      draggable
      eventHandlers={{
        drag(event) {
          const point = event.target.getLatLng();
          const miles =
            map.distance([center.latitude, center.longitude], point) / 1609.344;
          onRadiusChange(Math.min(200, Math.max(1, Math.round(miles))));
        },
      }}
    />
  );
}

export default function LocationRadiusMap({
  center,
  country,
  radiusMiles,
  onCenterChange,
  onRadiusChange,
  onViewportCenterChange,
}: LocationRadiusMapProps) {
  const view = initialView(country);
  const radiusMetres = radiusMiles * 1609.344;
  const handlePosition = useMemo<[number, number] | null>(() => {
    if (!center) return null;
    const longitudeOffset =
      radiusMiles /
      (69.172 * Math.max(0.1, Math.cos((center.latitude * Math.PI) / 180)));
    return [center.latitude, center.longitude + longitudeOffset];
  }, [center, radiusMiles]);

  return (
    <MapContainer
      center={view.center}
      zoom={view.zoom}
      className="h-72 w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents
        onCenterChange={onCenterChange}
        onViewportCenterChange={onViewportCenterChange}
      />
      <CountryView country={country} hasCenter={Boolean(center)} />
      <Recenter center={center} />
      {center ? (
        <>
          <Circle
            center={[center.latitude, center.longitude]}
            radius={radiusMetres}
            pathOptions={{
              color: "var(--primary)",
              fillColor: "var(--primary)",
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
          <Marker
            position={[center.latitude, center.longitude]}
            icon={centreIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const point = event.target.getLatLng();
                onCenterChange({
                  latitude: point.lat,
                  longitude: point.lng,
                });
              },
            }}
          />
          {handlePosition ? (
            <RadiusHandle
              center={center}
              position={handlePosition}
              onRadiusChange={onRadiusChange}
            />
          ) : null}
        </>
      ) : null}
    </MapContainer>
  );
}
