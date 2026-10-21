import test from "node:test";
import assert from "node:assert/strict";
import { splitFieldBoundary } from "../.test-build/lib/split-field-boundary.js";

const rectangle = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: 0 },
];

test("splits a simple rectangular boundary into two valid rings", () => {
  const [first, second] = splitFieldBoundary(rectangle, { lat: 0.5, lng: 0.4 }, { lat: 0.5, lng: 0.6 });
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.ok(first.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
  assert.ok(second.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
  assert.ok(first.some((point) => Math.abs(point.lat - 0.5) < 1e-8));
  assert.ok(second.some((point) => Math.abs(point.lat - 0.5) < 1e-8));
});

test("rejects boundaries with interior holes", () => {
  const withHole = { type: "Polygon", coordinates: [
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
    [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]],
  ] };
  assert.throws(() => splitFieldBoundary(withHole, { lat: 0.5, lng: 0.2 }, { lat: 0.5, lng: 0.8 }), /without interior holes/);
});

test("rejects a cut line that does not cross the field twice", () => {
  assert.throws(() => splitFieldBoundary(rectangle, { lat: 2, lng: 0.2 }, { lat: 2, lng: 0.8 }), /inside the selected field/);
});
