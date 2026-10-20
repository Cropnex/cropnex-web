type MapGeoJson = { type: "FeatureCollection"; features: Array<{ type?: string; geometry: { type: string; coordinates: unknown } | null; properties?: Record<string, unknown> | null }> };
export {};
type GeoJsonWorkerRequest = { text: string };
type GeoJsonWorkerResponse = { ok: true; geojson: MapGeoJson } | { ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GeoJsonWorkerRequest>) => void) | null;
  postMessage: (message: GeoJsonWorkerResponse) => void;
};

function countPositions(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") return 1;
  return value.reduce<number>((sum, child) => sum + countPositions(child), 0);
}

scope.onmessage = (event) => {
  try {
    const geojson = JSON.parse(event.data.text) as MapGeoJson;
    if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) throw new Error("This saved map layer is not a valid GeoJSON feature collection.");
    if (geojson.features.length > 25_000) throw new Error("This map layer has more than 25,000 polygons. Split the layer into smaller maps.");
    let vertices = 0;
    for (const feature of geojson.features) {
      vertices += countPositions(feature.geometry?.coordinates);
      if (vertices > 1_000_000) throw new Error("This map layer has more than 1,000,000 boundary points. Split it into smaller maps.");
    }
    scope.postMessage({ ok: true, geojson });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : "Could not read this map layer." });
  }
};
