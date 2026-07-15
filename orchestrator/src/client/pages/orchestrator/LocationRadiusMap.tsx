import "leaflet/dist/leaflet.css";

import { divIcon, type LeafletMouseEvent, latLng } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
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

function Recenter({
  center,
  radiusMiles,
}: {
  center: MapPoint | null;
  radiusMiles: number;
}) {
  const map = useMap();
  const previousCenter = useRef<MapPoint | null>(null);
  useEffect(() => {
    if (!center) {
      previousCenter.current = null;
      return;
    }
    if (!previousCenter.current) {
      map.fitBounds(
        latLng(center.latitude, center.longitude).toBounds(
          radiusMiles * 1609.344 * 2,
        ),
        { padding: [24, 24] },
      );
    } else if (
      previousCenter.current.latitude !== center.latitude ||
      previousCenter.current.longitude !== center.longitude
    ) {
      map.panTo([center.latitude, center.longitude]);
    }
    previousCenter.current = center;
  }, [center, map, radiusMiles]);
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
  const [dragCenter, setDragCenter] = useState<MapPoint | null>(null);
  const visibleCenter = dragCenter ?? center;
  const view = initialView(country);
  const radiusMetres = radiusMiles * 1609.344;
  const handlePosition = useMemo<[number, number] | null>(() => {
    if (!visibleCenter) return null;
    const longitudeOffset =
      radiusMiles /
      (69.172 *
        Math.max(0.1, Math.cos((visibleCenter.latitude * Math.PI) / 180)));
    return [visibleCenter.latitude, visibleCenter.longitude + longitudeOffset];
  }, [visibleCenter, radiusMiles]);

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
      <Recenter center={center} radiusMiles={radiusMiles} />
      {visibleCenter ? (
        <>
          <Circle
            center={[visibleCenter.latitude, visibleCenter.longitude]}
            radius={radiusMetres}
            pathOptions={{
              color: "var(--primary)",
              fillColor: "var(--primary)",
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
          <Marker
            position={[visibleCenter.latitude, visibleCenter.longitude]}
            icon={centreIcon}
            draggable
            eventHandlers={{
              drag(event) {
                const point = event.target.getLatLng();
                setDragCenter({
                  latitude: point.lat,
                  longitude: point.lng,
                });
              },
              dragend(event) {
                const point = event.target.getLatLng();
                const nextCenter = {
                  latitude: point.lat,
                  longitude: point.lng,
                };
                setDragCenter(null);
                onCenterChange(nextCenter);
              },
            }}
          />
          {handlePosition ? (
            <RadiusHandle
              center={visibleCenter}
              position={handlePosition}
              onRadiusChange={onRadiusChange}
            />
          ) : null}
        </>
      ) : null}
    </MapContainer>
  );
}
