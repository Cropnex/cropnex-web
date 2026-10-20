import shp from "shpjs";
import { geometryAreaHa, geometryPolygons, validCoordinates } from "@/lib/geojson-layer";
import type { GeoJsonFeature, GeoJsonGeometry } from "@/lib/geojson-layer";

type ParseRequest = { buffer: ArrayBuffer };
type ParsedFeature = {
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
  areaHa: number;
  warning: string | null;
};
type ParseResponse =
  | { ok: true; attributes: string[]; nameAttribute: string; displayAttribute: string; features: ParsedFeature[] }
  | { ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: ParseResponse) => void;
};
const MAX_FEATURES = 25_000;
const MAX_VERTICES = 1_000_000;

function countPositions(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") return 1;
  return value.reduce<number>((sum, child) => sum + countPositions(child), 0);
}

scope.onmessage = async (event) => {
  try {
    const parsed = await shp(event.data.buffer);
    const collections = Array.isArray(parsed) ? parsed : [parsed];
    const sourceFeatures = collections.flatMap((collection) => collection.features || []) as GeoJsonFeature[];
    const polygonFeatures = sourceFeatures.filter((feature) => geometryPolygons(feature.geometry).length > 0);
    if (!polygonFeatures.length) throw new Error("No Polygon or MultiPolygon features were found in this ZIP.");
    if (polygonFeatures.length > MAX_FEATURES) throw new Error(`This ZIP contains ${polygonFeatures.length.toLocaleString()} polygon features. Split it into smaller farm groups (maximum ${MAX_FEATURES.toLocaleString()} per import).`);

    let vertexCount = 0;
    for (const feature of polygonFeatures) {
      vertexCount += countPositions(feature.geometry?.coordinates);
      if (vertexCount > MAX_VERTICES) throw new Error(`This ZIP contains more than ${MAX_VERTICES.toLocaleString()} boundary points. Split it into smaller farm groups before importing.`);
    }

    const attributes = Array.from(new Set(polygonFeatures.flatMap((feature) => Object.keys(feature.properties || {}))));
    const nameHints = ["field_name", "fieldname", "field", "name", "land", "kamp", "block", "id"];
    const nameAttribute = nameHints.map((hint) => attributes.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === hint.replace(/_/g, ""))).find(Boolean) || attributes[0] || "";
    const displayAttribute = attributes.find((key) => /soil|class|type|zone|crop|yield/i.test(key)) || attributes[0] || "";
    const features = polygonFeatures.map((feature) => {
      const geometry = feature.geometry as GeoJsonGeometry;
      const polygons = geometryPolygons(geometry);
      const valid = validCoordinates(geometry);
      const multipart = polygons.length > 1;
      const hasHoles = polygons.some((polygon) => polygon.length > 1);
      return {
        geometry,
        properties: feature.properties || {},
        areaHa: geometryAreaHa(geometry),
        warning: !valid
          ? "Coordinates are outside valid latitude and longitude ranges."
          : multipart || hasHoles
            ? "This shape has multiple parts or interior rings. Import it as one map layer to preserve the full geometry."
            : null,
      };
    });
    scope.postMessage({ ok: true, attributes, nameAttribute, displayAttribute, features });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : "Could not read the shapefile. Confirm all parts are together in the ZIP." });
  }
};
