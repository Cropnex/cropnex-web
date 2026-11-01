import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const boundary = [
  { lat: -26, lng: 28 },
  { lat: -26, lng: 28.01 },
  { lat: -26.01, lng: 28 },
];

const request = (body: string, authorization = "Bearer farm-token") =>
  new NextRequest("https://cropnex.example/api/copernicus/generate", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body,
  });

const validBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    boundary,
    date: "2026-10-20",
    sceneId: "scene-1",
    ...overrides,
  });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.stubEnv("COPERNICUS_CLIENT_ID", "client-id");
  vi.stubEnv("COPERNICUS_CLIENT_SECRET", "client-secret");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Copernicus NDVI generation", () => {
  it("reports whether Copernicus credentials are configured", async () => {
    vi.stubEnv("COPERNICUS_CLIENT_ID", "");
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "CropNex Copernicus NDVI processor",
      configured: false,
    });

    vi.stubEnv("COPERNICUS_CLIENT_ID", "client-id");
    expect((await GET().json()).configured).toBe(true);
  });

  it("requires an authenticated user and valid boundary/date input", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("authenticated"));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(request(validBody(), ""))).status).toBe(401);
    for (const body of [
      "{",
      "null",
      "[]",
      JSON.stringify({ boundary: [], date: "2026-10-20" }),
      JSON.stringify({ boundary, date: 20261020 }),
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("reports missing credentials, token errors, and invalid token responses", async () => {
    vi.stubEnv("COPERNICUS_CLIENT_SECRET", "");
    let fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("authenticated"));
    vi.stubGlobal("fetch", fetchMock);
    const missing = await POST(request(validBody()));
    expect(missing.status).toBe(500);
    await expect(missing.json()).resolves.toMatchObject({
      error: "Copernicus credentials are not configured in Vercel.",
    });

    vi.stubEnv("COPERNICUS_CLIENT_SECRET", "client-secret");
    fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(
        Response.json({ error_description: "invalid client" }, { status: 401 }),
      )
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const rejected = await POST(request(validBody()));
    expect(rejected.status).toBe(500);
    await expect(rejected.json()).resolves.toEqual({ error: "invalid client" });
    const emptyToken = await POST(request(validBody()));
    expect(emptyToken.status).toBe(500);
    await expect(emptyToken.json()).resolves.toEqual({
      error: "Copernicus authentication failed.",
    });
  });

  it("generates an image and extracts optional NDVI statistics", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({ access_token: "cdse-token" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              outputs: {
                ndvi: { bands: { B0: { stats: { mean: 0.6, min: 0.2, max: 0.9 } } } },
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      image: "iVBORw==",
      contentType: "image/png",
      stats: { mean: 0.6, min: 0.2, max: 0.9 },
      sceneId: "scene-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain(
      "grant_type=client_credentials",
    );
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      authorization: "Bearer cdse-token",
      accept: "image/png",
    });
    const imageRequest = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(imageRequest.input.data[0].dataFilter.timeRange).toEqual({
      from: "2026-10-20T00:00:00Z",
      to: "2026-10-20T23:59:59Z",
    });
    expect(imageRequest.output.width).toBe(768);
    const statsRequest = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(statsRequest.input.data[0].processing.upsampling).toBe("BILINEAR");
  });

  it("uses null statistics when absent or unavailable and defaults the scene id", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({ access_token: "cdse-token" }))
      .mockResolvedValueOnce(new Response("image"))
      .mockResolvedValueOnce(Response.json({ data: [{}] }))
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({ access_token: "cdse-token" }))
      .mockResolvedValueOnce(new Response("image"))
      .mockResolvedValueOnce(new Response("stats unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const noStats = await POST(request(validBody({ sceneId: "" })));
    await expect(noStats.json()).resolves.toMatchObject({
      stats: { mean: null, min: null, max: null },
      sceneId: null,
    });
    const unavailable = await POST(request(validBody()));
    await expect(unavailable.json()).resolves.toMatchObject({
      stats: { mean: null, min: null, max: null },
    });
  });

  it("surfaces image service errors and failed fetches", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({ access_token: "cdse-token" }))
      .mockResolvedValueOnce(new Response("bad image", { status: 429 }))
      .mockResolvedValueOnce(new Response("unused"))
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(Response.json({ access_token: "cdse-token" }))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const imageError = await POST(request(validBody()));
    expect(imageError.status).toBe(500);
    await expect(imageError.json()).resolves.toMatchObject({
      error: "Copernicus image processing returned 429: bad image",
    });
    const networkError = await POST(request(validBody()));
    expect(networkError.status).toBe(500);
    await expect(networkError.json()).resolves.toEqual({ error: "network down" });
  });
});
