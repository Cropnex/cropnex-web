import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const request = (body: string, authorization = "Bearer access-token") =>
  new Request("https://cropnex.example/api/scouting-diagnosis", {
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

describe("scouting diagnosis POST", () => {
  it("reports missing configuration without making a request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request('{"image":"data:image/png;base64,abc"}'));

    expect(response.status).toBe(503);
    expect(fetchMock.mock.calls.every(([url]) =>
      String(url).endsWith("/auth/v1/user"),
    )).toBe(true);
  });

  it("rejects malformed or missing image input without calling OpenAI", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);

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

  it("sends a cautious structured diagnosis request and returns parsed data", async () => {
    const diagnosis = {
      issue_name: "Leaf spots",
      category: "Disease",
      severity: "Medium",
      confidence: 60,
      possible_causes: ["Fungal infection"],
      recommendation: "Inspect additional plants.",
      active_ingredients: ["Copper"],
      warning_signs: ["Rapid spread"],
    };
    const fetchMock = authenticatedFetch(() =>
      Promise.resolve(
        openAiResponse({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(diagnosis) },
              ],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_SCANNER_MODEL", "vision-test-model");

    const response = await POST(
      request(
        JSON.stringify({
          image: "data:image/png;base64,abc",
          crop: "Maize",
          cropStage: "Flowering",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: diagnosis });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer openai-key",
      "Content-Type": "application/json",
    });
    const payload = JSON.parse(String(options?.body));
    expect(payload.model).toBe("vision-test-model");
    expect(payload.store).toBe(false);
    expect(payload.input[0].content[0].text).toContain(
      "Maize at Flowering stage",
    );
    expect(payload.input[0].content[1]).toMatchObject({
      type: "input_image",
      image_url: "data:image/png;base64,abc",
      detail: "high",
    });
    expect(payload.text.format.schema.additionalProperties).toBe(false);
  });

  it("handles provider errors, missing output, and invalid provider JSON", async () => {
    const fetchMock = authenticatedFetch(
      () =>
        Promise.resolve(
          openAiResponse({ error: { message: "provider unavailable" } }, 503),
        ),
      () => Promise.resolve(openAiResponse({ output: [] })),
      () =>
        Promise.resolve(
        openAiResponse({
          output: [{ content: [{ type: "output_text", text: "not json" }] }],
        }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const makeRequest = () => request('{"image":"data:image/jpeg;base64,abc"}');

    const providerError = await POST(makeRequest());
    expect(providerError.status).toBe(503);
    await expect(providerError.json()).resolves.toEqual({
      error: "provider unavailable",
    });
    const noOutput = await POST(makeRequest());
    expect(noOutput.status).toBe(422);
    const invalidOutput = await POST(makeRequest());
    expect(invalidOutput.status).toBe(500);
  });

  it("reports aborts and non-Error failures explicitly", async () => {
    const fetchMock = authenticatedFetch(
      () => Promise.reject(new DOMException("aborted", "AbortError")),
      () => Promise.reject("unknown"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const timedOut = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(timedOut.status).toBe(500);
    await expect(timedOut.json()).resolves.toMatchObject({
      error: "The diagnosis took too long. Please try a clearer, cropped photo.",
    });
    const unknownError = await POST(
      request('{"image":"data:image/png;base64,abc"}'),
    );
    expect(unknownError.status).toBe(500);
    await expect(unknownError.json()).resolves.toMatchObject({
      error: "Diagnosis failed.",
    });
  });
});
