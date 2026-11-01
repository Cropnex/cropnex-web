import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const userRequest = (body: string, authorization = "Bearer user-token") =>
  new Request("https://cropnex.example/api/assistant", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body,
  });

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

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

describe("assistant POST", () => {
  it("requires a bearer token before contacting external services", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(userRequest('{"question":"hello"}', ""));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing Supabase and OpenAI configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const noSupabase = await POST(userRequest('{"question":"hello"}'));
    expect(noSupabase.status).toBe(503);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("OPENAI_API_KEY", "");
    const noOpenAi = await POST(userRequest('{"question":"hello"}'));
    expect(noOpenAi.status).toBe(503);
  });

  it("rejects expired identity tokens and forwards the user's bearer token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(userRequest('{"question":"hello"}'));

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      apikey: "public-key",
      Authorization: "Bearer user-token",
    });
  });

  it("returns client errors for malformed JSON, null bodies, and invalid questions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("ok")),
    );

    const malformed = await POST(userRequest("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: "Enter a valid JSON question.",
    });

    const nullBody = await POST(userRequest("null"));
    expect(nullBody.status).toBe(400);

    const missingQuestion = await POST(userRequest('{"question":"  "}'));
    expect(missingQuestion.status).toBe(400);

    const wrongType = await POST(userRequest('{"question":42}'));
    expect(wrongType.status).toBe(400);

    const tooLong = await POST(
      userRequest(JSON.stringify({ question: "x".repeat(2001) })),
    );
    expect(tooLong.status).toBe(400);
  });

  it("answers using bounded farm context and configured request settings", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(
        jsonResponse({
          output: [{ content: [{ type: "output_text", text: "Plant in rows." }] }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_ASSISTANT_MODEL", "test-model");

    const response = await POST(
      userRequest(
        JSON.stringify({
          question: "  How should I plan?  ",
          season: "2026/27",
          context: { fields: [{ field_name: "North" }], records: "x".repeat(50000) },
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: "Plant in rows." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer openai-key",
      "Content-Type": "application/json",
    });
    const requestBody = JSON.parse(String(options?.body));
    expect(requestBody.model).toBe("test-model");
    expect(requestBody.store).toBe(false);
    expect(requestBody.input[1].content).toContain(
      "Selected season: 2026/27\nQuestion: How should I plan?",
    );
    expect(requestBody.input[1].content.length).toBeLessThan(42100);
  });

  it("uses safe defaults, reports provider errors, and rejects empty provider output", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "rate limited" } }, 429),
      )
      .mockResolvedValueOnce(new Response("authenticated"))
      .mockResolvedValueOnce(jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const providerError = await POST(
      userRequest(JSON.stringify({ question: "Help", context: null })),
    );
    expect(providerError.status).toBe(429);
    await expect(providerError.json()).resolves.toEqual({
      error: "rate limited",
    });
    const noAnswer = await POST(userRequest('{"question":"Help"}'));
    expect(noAnswer.status).toBe(502);
    expect(fetchMock.mock.calls[1][1]?.body).toContain("gpt-4o-mini");
  });

  it("converts unexpected fetch failures into explicit server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")),
    );
    const response = await POST(userRequest('{"question":"Help"}'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "network down" });
  });
});
