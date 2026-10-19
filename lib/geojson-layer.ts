export type MapPoint = { lat: number; lng: number };
export type PolygonRings = MapPoint[][];

export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

export type GeoJsonFeature = {
  type?: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: GeoJsonGeometry | null;
};

export function createFeatureCollection(name: string, features: GeoJsonFeature[]) {
  return {
    type: "FeatureCollection" as const,
    name,
    features: features.map(({ geometry, properties }) => ({
      type: "Feature" as const,
      geometry,
      properties: properties || {},
    })),
  };
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function ringToPoints(value: unknown): MapPoint[] {
  if (!Array.isArray(value)) return [];
  const points = value.filter(isPosition).map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
  if (points.length > 1 && points[0].lat === points.at(-1)?.lat && points[0].lng === points.at(-1)?.lng) points.pop();
  return points;
}

export function geometryPolygons(geometry: GeoJsonGeometry | null | undefined): PolygonRings[] {
  if (!geometry) return [];
  const coordinates = geometry.coordinates;
  const polygons = geometry.type === "Polygon" ? [coordinates] : geometry.type === "MultiPolygon" ? coordinates : [];
  if (!Array.isArray(polygons)) return [];
  return polygons.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    const rings = polygon.map(ringToPoints).filter((ring) => ring.length >= 3);
    return rings.length ? [rings] : [];
  });
}

export function geometryPoints(geometry: GeoJsonGeometry | null | undefined): MapPoint[] {
  return geometryPolygons(geometry).flatMap((polygon) => polygon.flat());
}

function signedRingAreaHa(points: MapPoint[]): number {
  const radius = 6_378_137;
  const toRadians = Math.PI / 180;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += (b.lng - a.lng) * toRadians * (2 + Math.sin(a.lat * toRadians) + Math.sin(b.lat * toRadians));
  }
  return Math.abs(sum * radius * radius / 2) / 10_000;
}

export function geometryAreaHa(geometry: GeoJsonGeometry | null | undefined): number {
  return geometryPolygons(geometry).reduce((total, rings) => {
    const [outer, ...holes] = rings;
    return total + Math.max(0, signedRingAreaHa(outer) - holes.reduce((sum, hole) => sum + signedRingAreaHa(hole), 0));
  }, 0);
}

export function validCoordinates(geometry: GeoJsonGeometry | null | undefined): boolean {
  const points = geometryPoints(geometry);
  return points.length > 0 && points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180);
}

export function categoryColor(value: unknown): string {
  const text = String(value ?? "Unclassified");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue} 52% 42%)`;
}

