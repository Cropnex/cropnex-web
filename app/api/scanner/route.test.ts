import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const request = (body: string, authorization = "Bearer access-token") =>
  new Request("https://cropnex.example/api/scanner", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "content-type": "application/json",
    },
    body,
  });

const openAiResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const authenticatedFetch = (...providerCalls: (() => Promise<Response>)[]) => {
  let index = 0;
  return vi.fn<typeof fetch>().mockImplementation((input) => {
    if (String(input).endsWith("/auth/v1/user"))
      return Promise.resolve(new Response("{}", { status: 200 }));
    const call = providerCalls[index++];
    return call
      ? call()
      : Promise.reject(new Error("Unexpected provider request."));
  });
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.stubEnv("OPENAI_API_KEY", "openai-key");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scanner POST", () => {
  it("reports missing configuration and rejects invalid image payloads", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "");
    const noKey = await POST(request('{"image":"data:image/png;base64,abc"}'));
    expect(noKey.status).toBe(503);

    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    for (const body of ["{", "null", "[]", '{"image":42}', "{}"]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(fetchMock.mock.calls.every(([url]) =>
      String(url).endsWith("/auth/v1/user"),
    )).toBe(true);
  });

  it("rejects missing and invalid sessions before calling OpenAI", async () => {
    const noTokenFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", noTokenFetch);
    const missing = await POST(
      request('{"image":"data:image/png;base64,abc"}', ""),
    );
    expect(missing.status).toBe(401);
    expect(noTokenFetch).not.toHaveBeenCalled();

    const invalidTokenFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", invalidTokenFetch);
    const invalid = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(invalid.status).toBe(401);
    expect(invalidTokenFetch).toHaveBeenCalledOnce();
  });

  it("fails closed when Supabase auth configuration or verification is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const noUrl = await POST(request('{"image":"data:image/png;base64,abc"}'));
    expect(noUrl.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const noKey = await POST(request('{"image":"data:image/png;base64,abc"}'));
    expect(noKey.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 500 }));
    const unavailable = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(unavailable.status).toBe(503);

    fetchMock.mockRejectedValue(new Error("network failure"));
    const networkFailure = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(networkFailure.status).toBe(503);
  });

  it("extracts a transport document using structured output and a selected type", async () => {
    const result = {
      document_type: "Transport delivery note",
      document_date: null,
      load_number: "LOAD-1",
      ticket_number: null,
      driver_name: null,
      truck_registration: null,
      trailer_registration: null,
      transporter: null,
      destination_name: null,
      gross_tonnes: null,
      tare_tonnes: null,
      net_tonnes: 12,
      accepted_tonnes: null,
      rejected_tonnes: null,
      moisture_percent: null,
      grade: null,
      supplier: null,
      reference: null,
      inventory_items: [],
      confidence: 91,
      notes: null,
    };
    const fetchMock = authenticatedFetch(() =>
      Promise.resolve(
        openAiResponse({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(result) },
              ],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_SCANNER_MODEL", "scanner-test-model");

    const response = await POST(
      request(
        JSON.stringify({
          image: "data:image/jpeg;base64,abc",
          documentType: "Transport delivery note",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: result });
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer openai-key",
      "Content-Type": "application/json",
    });
    const payload = JSON.parse(String(options?.body));
    expect(payload.model).toBe("scanner-test-model");
    expect(payload.input[0].content[0].text).toContain(
      "selected document type is Transport delivery note",
    );
    expect(payload.input[0].content[1].image_url).toBe(
      "data:image/jpeg;base64,abc",
    );
    expect(payload.text.format.schema.additionalProperties).toBe(false);
  });

  it("uses a default document type and returns provider and output errors", async () => {
    const fetchMock = authenticatedFetch(
      () =>
        Promise.resolve(
        openAiResponse({ error: { message: "provider error" } }, 429),
        ),
      () => Promise.resolve(openAiResponse({ output: [] })),
      () =>
        Promise.resolve(
        openAiResponse({
          output: [{ content: [{ type: "output_text", text: "invalid" }] }],
        }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const makeRequest = () => request('{"image":"data:image/png;base64,abc"}');

    const providerError = await POST(makeRequest());
    expect(providerError.status).toBe(429);
    await expect(providerError.json()).resolves.toEqual({
      error: "provider error",
    });
    const noOutput = await POST(makeRequest());
    expect(noOutput.status).toBe(422);
    const invalidOutput = await POST(makeRequest());
    expect(invalidOutput.status).toBe(500);
    const firstPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstPayload.input[0].content[0].text).toContain(
      "selected document type is agricultural document",
    );
  });

  it("maps aborts to a timeout response and handles unknown thrown values", async () => {
    const fetchMock = authenticatedFetch(
      () => Promise.reject(new DOMException("aborted", "AbortError")),
      () => Promise.reject("unknown"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const timedOut = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toMatchObject({
      error: "The scanner took too long. Please retry with a clear, cropped image.",
    });
    const unknownError = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(unknownError.status).toBe(500);
    await expect(unknownError.json()).resolves.toEqual({
      error: "Scanner failed.",
    });
  });
});
