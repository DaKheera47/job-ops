import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import LocationRadiusMap from "./LocationRadiusMap";

const { fitBoundsMock, invalidateSizeMock, observeMock, resizeObserverState } =
  vi.hoisted(() => ({
    fitBoundsMock: vi.fn(),
    invalidateSizeMock: vi.fn(),
    observeMock: vi.fn(),
    resizeObserverState: {
      callback: null as ResizeObserverCallback | null,
    },
  }));

vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(callback: ResizeObserverCallback) {
      resizeObserverState.callback = callback;
    }
    observe = observeMock;
    disconnect = vi.fn();
    unobserve = vi.fn();
  },
);

vi.mock("leaflet", () => ({
  divIcon: ({ className }: { className: string }) => ({ className }),
  latLng: () => ({ toBounds: (metres: number) => metres }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    className,
  }: {
    children: ReactNode;
    className: string;
  }) => (
    <div data-testid="radius-map" className={className}>
      {children}
    </div>
  ),
  TileLayer: () => null,
  Circle: ({ center }: { center: [number, number] }) => (
    <div data-testid="radius-circle" data-position={center.join(",")} />
  ),
  Marker: ({
    position,
    icon,
    eventHandlers,
  }: {
    position: [number, number];
    icon: { className: string };
    eventHandlers?: {
      drag?: (event: { target: { getLatLng: () => unknown } }) => void;
      dragend?: (event: { target: { getLatLng: () => unknown } }) => void;
    };
  }) => {
    const event = {
      target: { getLatLng: () => ({ lat: 55, lng: -2 }) },
    };
    return (
      <button
        type="button"
        data-testid={icon.className}
        data-position={position.join(",")}
        onMouseMove={() => eventHandlers?.drag?.(event)}
        onMouseUp={() => eventHandlers?.dragend?.(event)}
      />
    );
  },
  useMap: () => ({
    distance: () => 1609.344,
    fitBounds: fitBoundsMock,
    getContainer: () => document.createElement("div"),
    invalidateSize: invalidateSizeMock,
    panTo: vi.fn(),
    setView: vi.fn(),
  }),
  useMapEvents: () => ({
    getCenter: () => ({ lat: 54.5, lng: -3 }),
  }),
}));

describe("LocationRadiusMap", () => {
  it("keeps the viewport square and updates Leaflet after resizing", () => {
    render(
      <LocationRadiusMap
        center={{ latitude: 47.0776, longitude: 8.02 }}
        country="switzerland"
        radiusMiles={43}
        onCenterChange={vi.fn()}
        onRadiusChange={vi.fn()}
        onViewportCenterChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("radius-map")).toHaveClass("aspect-square");
    expect(observeMock).toHaveBeenCalledOnce();
    resizeObserverState.callback?.([], {} as ResizeObserver);
    expect(invalidateSizeMock).toHaveBeenCalledWith({ pan: false });
  });

  it("frames the saved radius on initial load", () => {
    render(
      <LocationRadiusMap
        center={{ latitude: 47.0776, longitude: 8.02 }}
        country="switzerland"
        radiusMiles={43}
        onCenterChange={vi.fn()}
        onRadiusChange={vi.fn()}
        onViewportCenterChange={vi.fn()}
      />,
    );

    expect(fitBoundsMock).toHaveBeenCalledWith(43 * 1609.344 * 2, {
      padding: [24, 24],
    });
  });

  it("moves the radius and handle with the centre marker before committing", () => {
    const onCenterChange = vi.fn();
    render(
      <LocationRadiusMap
        center={{ latitude: 54.5, longitude: -3 }}
        country="united kingdom"
        radiusMiles={50}
        onCenterChange={onCenterChange}
        onRadiusChange={vi.fn()}
        onViewportCenterChange={vi.fn()}
      />,
    );

    const marker = screen.getByTestId("jobops-map-pin");
    const initialHandle = screen
      .getByTestId("jobops-map-radius-handle")
      .getAttribute("data-position");
    fireEvent.mouseMove(marker);

    expect(screen.getByTestId("radius-circle")).toHaveAttribute(
      "data-position",
      "55,-2",
    );
    expect(
      screen
        .getByTestId("jobops-map-radius-handle")
        .getAttribute("data-position"),
    ).not.toBe(initialHandle);
    expect(onCenterChange).not.toHaveBeenCalled();

    fireEvent.mouseUp(marker);
    expect(onCenterChange).toHaveBeenCalledOnce();
  });
});
