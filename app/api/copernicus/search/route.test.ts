import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const boundary = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 },
];

const request = (body: string, authorization = "Bearer farm-token") =>
  new NextRequest("https://cropnex.example/api/copernicus/search", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body,
  });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Copernicus scene search", () => {
  it("returns service status without external requests", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "CropNex Copernicus scene search",
    });
  });

  it("requires a bearer token and rejects invalid identities", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const missing = await POST(
      request(JSON.stringify({ boundary, from: "2026-01-01", to: "2026-02-01" }), ""),
    );
    expect(missing.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const invalid = await POST(
      request(JSON.stringify({ boundary, from: "2026-01-01", to: "2026-02-01" })),
    );
    expect(invalid.status).toBe(401);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      authorization: "Bearer farm-token",
      apikey: "public-key",
    });
  });

  it("rejects malformed or incomplete date and boundary input", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("authenticated"));
    vi.stubGlobal("fetch", fetchMock);

    for (const body of [
      "{",
      "null",
      "[]",
      JSON.stringify({ boundary, from: 20260101, to: "2026-02-01" }),
      JSON.stringify({ boundary: [], from: "2026-01-01", to: "2026-02-01" }),
      JSON.stringify({ boundary, from: "2026-01-01", to: "" }),
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("constrains cloud cover and maps returned scene data with safe defaults", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(
        Response.json({
          features: [
            {
              id: "scene-1",
              properties: {
                datetime: "2026-10-20T08:30:00Z",
                "eo:cloud_cover": 12.5,
                platform: "sentinel-2a",
              },
            },
            { id: "scene-2" },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);

    const first = await POST(
      request(
        JSON.stringify({
          boundary,
          from: "2026-10-01",
          to: "2026-10-31",
          maxCloud: 150,
        }),
      ),
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      scenes: [
        {
          id: "scene-1",
          date: "2026-10-20",
          cloudCover: 12.5,
          platform: "sentinel-2a",
        },
        { id: "scene-2", date: "", cloudCover: 0, platform: "Sentinel-2" },
      ],
    });
    const searchOptions = fetchMock.mock.calls[1][1];
    expect(searchOptions?.method).toBe("POST");
    const body = JSON.parse(String(searchOptions?.body));
    expect(body.query["eo:cloud_cover"].lte).toBe(100);
    expect(body.datetime).toBe("2026-10-01T00:00:00Z/2026-10-31T23:59:59Z");
    expect(body.intersects.type).toBe("Polygon");
    expect(body.limit).toBe(12);

    await POST(
      request(
        JSON.stringify({
          boundary,
          from: "2026-10-01",
          to: "2026-10-31",
          maxCloud: -5,
        }),
      ),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[3][1]?.body)).query[
        "eo:cloud_cover"
      ].lte,
    ).toBe(0);
  });

  it("returns empty results and reports catalogue and authentication failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockRejectedValueOnce(new Error("auth service down"));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ boundary, from: "2026-01-01", to: "2026-02-01" });

    const emptyResult = await POST(request(body));
    await expect(emptyResult.json()).resolves.toEqual({ scenes: [] });
    const catalogueFailure = await POST(request(body));
    expect(catalogueFailure.status).toBe(500);
    await expect(catalogueFailure.json()).resolves.toMatchObject({
      error: "Copernicus catalogue returned 503.",
    });
    const authFailure = await POST(request(body));
    expect(authFailure.status).toBe(500);
    await expect(authFailure.json()).resolves.toEqual({
      error: "auth service down",
    });
  });
});
