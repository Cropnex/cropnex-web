import { describe, expect, it } from "vitest";
import {
  categoryColor,
  createFeatureCollection,
  geometryAreaHa,
  geometryPoints,
  geometryPolygons,
  validCoordinates,
} from "@/lib/geojson-layer";

describe("GeoJSON normalization and validation", () => {
  it("handles null, unsupported, and malformed geometries without throwing", () => {
    expect(geometryPolygons(null)).toEqual([]);
    expect(geometryPolygons(undefined)).toEqual([]);
    expect(geometryPolygons({ type: "Point", coordinates: [1, 2] })).toEqual(
      [],
    );
    expect(
      geometryPolygons({ type: "MultiPolygon", coordinates: "invalid" }),
    ).toEqual([]);
    expect(
      geometryPolygons({
        type: "MultiPolygon",
        coordinates: [
          null,
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          ],
        ],
      }),
    ).toEqual([
      [
        [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 1 },
        ],
      ],
    ]);
    expect(
      geometryPolygons({
        type: "Polygon",
        coordinates: [
          null,
          [[1, 2]],
          [
            [1, 2],
            ["no", 4],
            [3, 5],
          ],
        ],
      }),
    ).toEqual([]);
    expect(geometryPoints(null)).toEqual([]);
    expect(geometryAreaHa(null)).toBe(0);
    expect(validCoordinates(null)).toBe(false);
  });

  it("coerces numeric strings, drops malformed positions, and removes ring closure", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          ["28", "-26"],
          [28.01, -26],
          ["invalid", -26],
          [28.01, -26.01],
          [28, -26],
        ],
      ],
    };
    expect(geometryPolygons(geometry)).toEqual([
      [
        [
          { lat: -26, lng: 28 },
          { lat: -26, lng: 28.01 },
          { lat: -26.01, lng: 28.01 },
        ],
      ],
    ]);
    expect(geometryPoints(geometry)).toHaveLength(3);
    expect(geometryAreaHa(geometry)).toBeGreaterThan(0);
  });

  it("clamps polygon areas that are smaller than their interior rings", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0],
        ],
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, -1],
        ],
      ],
    };
    expect(geometryAreaHa(geometry)).toBe(0);
  });

  it("accepts inclusive geographic bounds and defaults missing feature properties", () => {
    expect(
      validCoordinates({
        type: "Polygon",
        coordinates: [
          [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, -90],
          ],
        ],
      }),
    ).toBe(true);
    expect(
      createFeatureCollection("empty", [
        { geometry: null, properties: null },
        { geometry: { type: "Point", coordinates: [0, 0] } },
      ]),
    ).toEqual({
      type: "FeatureCollection",
      name: "empty",
      features: [
        { type: "Feature", geometry: null, properties: {} },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {},
        },
      ],
    });
    expect(categoryColor(null)).toBe(categoryColor("Unclassified"));
  });
});
