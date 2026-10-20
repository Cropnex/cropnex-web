import type { FieldBoundary, Point } from "../types/field";

/** Normalize legacy point arrays and imported GeoJSON into polygon -> ring -> point paths. */
export function boundaryPolygonPaths(boundary: FieldBoundary | null | undefined): Point[][][] {
  if (!boundary) return [];
  if (Array.isArray(boundary)) return boundary.length ? [[boundary]] : [];
  if (boundary.type !== "Polygon" && boundary.type !== "MultiPolygon") return [];

  const raw = boundary.coordinates;
  const polygons: unknown[] = boundary.type === "Polygon" ? [raw] : Array.isArray(raw) ? raw : [];
  return polygons.map((polygon) => {
    if (!Array.isArray(polygon)) return [];
    return polygon.map((ring) => {
      if (!Array.isArray(ring)) return [];
      return ring.flatMap((position) => {
        if (!Array.isArray(position) || position.length < 2) return [];
        const lng = Number(position[0]);
        const lat = Number(position[1]);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
      });
    }).filter((ring) => ring.length >= 3);
  }).filter((polygon) => polygon.length > 0);
}

export function boundaryPoints(boundary: FieldBoundary | null | undefined): Point[] {
  return boundaryPolygonPaths(boundary).flat(2);
}

export function boundaryGeoJson(boundary: FieldBoundary, maximumPointsPerRing = 350): { type: "Polygon" | "MultiPolygon"; coordinates: unknown } {
  const polygons = boundaryPolygonPaths(boundary).map((polygon) => polygon.map((ring) => {
    const closed = ring.length > 1 && ring[0].lat === ring.at(-1)?.lat && ring[0].lng === ring.at(-1)?.lng;
    const source = closed ? ring.slice(0, -1) : ring;
    const stride = Math.max(1, Math.ceil(source.length / Math.max(3, maximumPointsPerRing - 1)));
    const sampled = source.filter((_, index) => index % stride === 0);
    const last = source.at(-1);
    if (last && sampled.at(-1) !== last) sampled.push(last);
    const coordinates = sampled.map(({ lng, lat }) => [lng, lat]);
    if (coordinates.length) coordinates.push([...coordinates[0]]);
    return coordinates;
  }));
  if (Array.isArray(boundary) || (typeof boundary === "object" && boundary.type === "Polygon")) {
    return { type: "Polygon", coordinates: polygons[0] || [] };
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

export function boundaryHasShape(boundary: FieldBoundary | null | undefined): boundary is FieldBoundary {
  return boundaryPolygonPaths(boundary).some((polygon) => (polygon[0]?.length || 0) >= 3);
}
