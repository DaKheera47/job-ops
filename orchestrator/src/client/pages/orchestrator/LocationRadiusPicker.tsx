import type { LocationProximity } from "@shared/types";
import { LocateFixed, MapPin } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MapPoint } from "./LocationRadiusMap";

const LocationRadiusMap = lazy(() => import("./LocationRadiusMap"));

interface LocationRadiusPickerProps {
  country: string;
  value: LocationProximity | null;
  radiusMiles: number;
  onChange: (value: LocationProximity) => void;
}

function getCountryCenter(country: string): MapPoint {
  if (country === "united kingdom") return { latitude: 54.5, longitude: -3 };
  if (country === "united states") return { latitude: 39, longitude: -98 };
  return { latitude: 20, longitude: 0 };
}

export function LocationRadiusPicker({
  country,
  value,
  radiusMiles,
  onChange,
}: LocationRadiusPickerProps) {
  const [viewportCenter, setViewportCenter] = useState<MapPoint>(
    value ?? getCountryCenter(country),
  );

  useEffect(() => {
    if (!value) setViewportCenter(getCountryCenter(country));
  }, [country, value]);

  const setCenter = (center: MapPoint) => {
    onChange({ ...center, radiusMiles: value?.radiusMiles ?? radiusMiles });
  };

  const setRadius = (nextRadius: number) => {
    if (!value) return;
    onChange({ ...value, radiusMiles: nextRadius });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setViewportCenter(center);
        setCenter(center);
      },
      () => toast.error("Your location could not be read."),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  return (
    <FieldGroup className="gap-4">
      <Field data-invalid={!value}>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <Suspense
            fallback={
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Loading map…
              </div>
            }
          >
            <LocationRadiusMap
              center={value}
              country={country}
              radiusMiles={value?.radiusMiles ?? radiusMiles}
              onCenterChange={setCenter}
              onRadiusChange={setRadius}
              onViewportCenterChange={setViewportCenter}
            />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCenter(viewportCenter)}
          >
            <MapPin data-icon="inline-start" />
            Use map centre
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={useCurrentLocation}
          >
            <LocateFixed data-icon="inline-start" />
            Use my location
          </Button>
          {value ? (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {value.latitude.toFixed(4)}, {value.longitude.toFixed(4)}
            </span>
          ) : null}
        </div>
        <FieldDescription>
          Click the map to place the centre. Drag the centre or edge handle to
          adjust the search area.
        </FieldDescription>
        {!value ? (
          <FieldError>Select a centre point on the map.</FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="location-radius-miles">Radius in miles</FieldLabel>
        <Input
          id="location-radius-miles"
          type="number"
          min={1}
          max={200}
          value={value?.radiusMiles ?? radiusMiles}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(next)) {
              setRadius(Math.min(200, Math.max(1, next)));
            }
          }}
          disabled={!value}
        />
      </Field>
    </FieldGroup>
  );
}
