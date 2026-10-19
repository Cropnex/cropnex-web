import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryColor,
  createFeatureCollection,
  geometryAreaHa,
  geometryPolygons,
  validCoordinates,
} from "../.test-build/geojson-layer.js";

test("Polygon conversion keeps outer and interior rings", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [[28, -26], [28.01, -26], [28.01, -26.01], [28, -26.01], [28, -26]],
      [[28.002, -26.002], [28.008, -26.002], [28.008, -26.008], [28.002, -26.008], [28.002, -26.002]],
    ],
  };
  const polygons = geometryPolygons(geometry);
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].length, 2);
  assert.ok(geometryAreaHa(geometry) > 0);
  assert.ok(geometryAreaHa(geometry) < geometryAreaHa({ type: "Polygon", coordinates: [geometry.coordinates[0]] }));
});

test("MultiPolygon conversion retains disconnected polygon groups", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [
      [[[28, -26], [28.01, -26], [28.01, -26.01], [28, -26.01], [28, -26]]],
      [[[28.02, -26], [28.03, -26], [28.03, -26.01], [28.02, -26.01], [28.02, -26]]],
    ],
  };
  assert.equal(geometryPolygons(geometry).length, 2);
  assert.ok(geometryAreaHa(geometry) > 150);
});

test("coordinate validation rejects projected or out-of-range coordinates", () => {
  assert.equal(validCoordinates({ type: "Polygon", coordinates: [[[28, -26], [29, -26], [28, -27], [28, -26]]] }), true);
  assert.equal(validCoordinates({ type: "Polygon", coordinates: [[[280000, 7100000], [280100, 7100000], [280000, 7100100]]] }), false);
});

test("category colours are stable and distinct for common categories", () => {
  assert.equal(categoryColor("Clay"), categoryColor("Clay"));
  assert.notEqual(categoryColor("Clay"), categoryColor("Loam"));
});

test("whole-map export keeps every feature, multipart geometry, holes and attributes", () => {
  const source = [
    { geometry: { type: "Polygon", coordinates: [[[28, -26], [28.01, -26], [28, -26.01], [28, -26]]] }, properties: { soil: "Clay" } },
    { geometry: { type: "MultiPolygon", coordinates: [[[[28.02, -26], [28.03, -26], [28.02, -26.01], [28.02, -26]]], [[[28.04, -26], [28.05, -26], [28.04, -26.01], [28.04, -26]]]] }, properties: { soil: "Loam", zone: 2 } },
  ];
  const collection = createFeatureCollection("soil.zip", source);
  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.name, "soil.zip");
  assert.equal(collection.features.length, 2);
  assert.equal(collection.features[1].geometry.type, "MultiPolygon");
  assert.equal(collection.features[1].properties.zone, 2);
});
