import { test } from "vitest";
import assert from "node:assert/strict";
import { splitFieldBoundary } from "../lib/split-field-boundary.ts";

const rectangle = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: 0 },
];

test("splits a simple rectangular boundary into two valid rings", () => {
  const [first, second] = splitFieldBoundary(
    rectangle,
    { lat: 0.5, lng: 0.4 },
    { lat: 0.5, lng: 0.6 },
  );
  assert.ok(first.length >= 3);
  assert.ok(second.length >= 3);
  assert.ok(
    first.every(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    ),
  );
  assert.ok(
    second.every(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    ),
  );
  assert.ok(first.some((point) => Math.abs(point.lat - 0.5) < 1e-8));
  assert.ok(second.some((point) => Math.abs(point.lat - 0.5) < 1e-8));
});

test("rejects boundaries with interior holes", () => {
  const withHole = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
        [0.2, 0.2],
      ],
    ],
  };
  assert.throws(
    () =>
      splitFieldBoundary(
        withHole,
        { lat: 0.5, lng: 0.2 },
        { lat: 0.5, lng: 0.8 },
      ),
    /without interior holes/,
  );
});

test("rejects a cut line that does not cross the field twice", () => {
  assert.throws(
    () =>
      splitFieldBoundary(rectangle, { lat: 2, lng: 0.2 }, { lat: 2, lng: 0.8 }),
    /inside the selected field/,
  );
});

test("handles closed rings, boundary taps, and split points too close together", () => {
  const closedRectangle = [...rectangle, rectangle[0]];
  const [first, second] = splitFieldBoundary(
    closedRectangle,
    { lat: 0, lng: 0.4 },
    { lat: 1, lng: 0.6 },
  );
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.throws(
    () =>
      splitFieldBoundary(
        rectangle,
        { lat: 0.5, lng: 0.5 },
        { lat: 0.5, lng: 0.5 },
      ),
    /farther apart/,
  );
});

test("handles intersections beyond the segment between interior taps", () => {
  const [first, second] = splitFieldBoundary(
    rectangle,
    { lat: 0.4, lng: 0.4 },
    { lat: 0.6, lng: 0.6 },
  );
  assert.ok(first.length >= 3);
  assert.ok(second.length >= 3);
});
