import { describe, expect, it } from "vitest";
import {
  boundaryGeoJson,
  boundaryHasShape,
  boundaryPoints,
  boundaryPolygonPaths,
} from "@/lib/field-boundary";
import type { FieldBoundary } from "@/types/field";

describe("field boundary normalization", () => {
  it("handles absent, empty, unsupported, and malformed boundaries", () => {
    expect(boundaryPolygonPaths(null)).toEqual([]);
    expect(boundaryPolygonPaths(undefined)).toEqual([]);
    expect(boundaryPolygonPaths([])).toEqual([]);
    expect(
      boundaryPolygonPaths({
        type: "LineString",
        coordinates: [],
      } as unknown as FieldBoundary),
    ).toEqual([]);
    expect(
      boundaryPolygonPaths({ type: "Polygon", coordinates: null }),
    ).toEqual([]);
    expect(
      boundaryPolygonPaths({
        type: "MultiPolygon",
        coordinates: "not-an-array",
      }),
    ).toEqual([]);
    expect(boundaryPoints(null)).toEqual([]);
    expect(boundaryHasShape(null)).toBe(false);
  });

  it("filters invalid positions and rings while coercing finite coordinates", () => {
    const boundary: FieldBoundary = {
      type: "Polygon",
      coordinates: [
        null,
        [
          [0, 0],
          [1, 1],
        ],
        [["1", "2"], ["invalid", 3], [4, "5"], [6, 7], [8], null],
      ],
    };

    expect(boundaryPolygonPaths(boundary)).toEqual([
      [
        [
          { lat: 2, lng: 1 },
          { lat: 5, lng: 4 },
          { lat: 7, lng: 6 },
        ],
      ],
    ]);
    expect(boundaryPoints(boundary)).toHaveLength(3);
    expect(boundaryHasShape(boundary)).toBe(true);
    expect(
      boundaryHasShape({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toBe(false);
  });

  it("exports closed GeoJSON rings and reduces oversized rings within limits", () => {
    const ring = Array.from({ length: 10 }, (_, index) => ({
      lat: index % 2,
      lng: index,
    }));
    ring.push(ring[0]);

    const geoJson = boundaryGeoJson(ring, 4);
    expect(geoJson.type).toBe("Polygon");
    const coordinates = (geoJson.coordinates as number[][][])[0];
    expect(coordinates.length).toBeLessThanOrEqual(5);
    expect(coordinates[0]).toEqual(coordinates.at(-1));

    expect(boundaryGeoJson([], 0)).toEqual({
      type: "Polygon",
      coordinates: [],
    });
  });

  it("preserves multipolygon shape for malformed input and always closes valid rings", () => {
    expect(
      boundaryGeoJson({ type: "MultiPolygon", coordinates: "invalid" }),
    ).toEqual({ type: "MultiPolygon", coordinates: [] });

    expect(
      boundaryGeoJson({
        type: "Polygon",
        coordinates: [
          [
            [28, -26],
            [28.1, -26],
            [28.1, -26.1],
          ],
        ],
      }),
    ).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [28, -26],
          [28.1, -26],
          [28.1, -26.1],
          [28, -26],
        ],
      ],
    });
  });
});
