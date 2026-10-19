declare namespace google.maps {
  class Map {
    fitBounds(bounds: LatLngBounds, padding?: number): void;
    panTo(position: { lat: number; lng: number }): void;
    setMapTypeId(mapTypeId: string): void;
    setZoom(zoom: number): void;
  }

  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class LatLngBounds {
    extend(position: { lat: number; lng: number }): LatLngBounds;
  }

  interface MapMouseEvent {
    latLng: LatLng | null;
  }

  const MapTypeId: { SATELLITE: string };
  const ControlPosition: { TOP_RIGHT: number };
  const SymbolPath: { CIRCLE: number };
  const geometry: {
    spherical: {
      computeArea(path: LatLng[]): number;
    };
  };
}
