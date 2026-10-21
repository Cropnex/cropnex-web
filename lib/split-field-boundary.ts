import type { FieldBoundary, Point } from "../types/field";
import { boundaryPolygonPaths } from "./field-boundary";

type Crossing = { edge: number; point: Point; t: number };

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const samePoint = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8;

function isInsideOrOnBoundary(point: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j]; const b = ring[i];
    const crossTrack = (point.lng - a.lng) * (b.lat - a.lat) - (point.lat - a.lat) * (b.lng - a.lng);
    const within = point.lng >= Math.min(a.lng, b.lng) - 1e-9 && point.lng <= Math.max(a.lng, b.lng) + 1e-9 && point.lat >= Math.min(a.lat, b.lat) - 1e-9 && point.lat <= Math.max(a.lat, b.lat) + 1e-9;
    if (Math.abs(crossTrack) < 1e-9 && within) return true;
    const crosses = (a.lat > point.lat) !== (b.lat > point.lat) && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Split a single simple exterior ring with an infinite line through the two map taps. */
export function splitFieldBoundary(boundary: FieldBoundary | null, first: Point, second: Point): [Point[], Point[]] {
  const polygons = boundaryPolygonPaths(boundary);
  if (polygons.length !== 1 || polygons[0].length !== 1) {
    throw new Error("Splitting currently supports one simple field outline without interior holes. Redraw or simplify this boundary first.");
  }

  let ring = polygons[0][0];
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) ring = ring.slice(0, -1);
  if (ring.length < 3) throw new Error("This field does not have a valid boundary to split.");
  if (!isInsideOrOnBoundary(first, ring) || !isInsideOrOnBoundary(second, ring)) throw new Error("Place both split points inside the selected field boundary.");

  const rx = second.lng - first.lng;
  const ry = second.lat - first.lat;
  if (Math.hypot(rx, ry) < 1e-9) throw new Error("Place the two split points farther apart.");

  const crossings: Crossing[] = [];
  for (let edge = 0; edge < ring.length; edge += 1) {
    const a = ring[edge];
    const b = ring[(edge + 1) % ring.length];
    const sx = b.lng - a.lng;
    const sy = b.lat - a.lat;
    const denominator = cross(rx, ry, sx, sy);
    if (Math.abs(denominator) < 1e-12) continue;
    const qx = a.lng - first.lng;
    const qy = a.lat - first.lat;
    const t = cross(qx, qy, sx, sy) / denominator;
    const u = cross(qx, qy, rx, ry) / denominator;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const point = { lat: first.lat + t * ry, lng: first.lng + t * rx };
    if (!crossings.some((item) => samePoint(item.point, point))) crossings.push({ edge, point, t });
  }

  if (crossings.length !== 2) {
    throw new Error(`The split line crosses this field ${crossings.length} times. Draw a straight line that passes through the field and exits on the opposite edge.`);
  }

  crossings.sort((a, b) => a.edge - b.edge);
  const [left, right] = crossings;
  const sideOne: Point[] = [left.point];
  for (let i = (left.edge + 1) % ring.length; i !== (right.edge + 1) % ring.length; i = (i + 1) % ring.length) sideOne.push(ring[i]);
  sideOne.push(right.point);

  const sideTwo: Point[] = [right.point];
  for (let i = (right.edge + 1) % ring.length; i !== (left.edge + 1) % ring.length; i = (i + 1) % ring.length) sideTwo.push(ring[i]);
  sideTwo.push(left.point);

  if (sideOne.length < 3 || sideTwo.length < 3) throw new Error("The split line did not create two usable field areas.");
  return [sideOne, sideTwo];
}
