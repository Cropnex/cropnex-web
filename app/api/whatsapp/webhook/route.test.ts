import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { GET, POST } from "./route";

const secret = "webhook-secret";

function signedRequest(body: string, signature?: string) {
  const digest =
    signature ??
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return new Request("https://cropnex.example/api/whatsapp/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": digest },
    body,
  });
}

function configureClient(
  senderResult: {
    data: {
      id: string;
      user_id: string;
      display_name?: string | null;
      default_shed_name?: string | null;
    } | null;
    error: Error | null;
  } = { data: null, error: null },
) {
  const maybeSingle = vi.fn().mockResolvedValue(senderResult);
  const eqActive = vi.fn().mockReturnValue({ maybeSingle });
  const eqPhone = vi.fn().mockReturnValue({ eq: eqActive });
  const select = vi.fn().mockReturnValue({ eq: eqPhone });
  const upsert = vi
    .fn<
      (
        value: Record<string, unknown>,
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) => Promise<{ error: Error | null }>
    >()
    .mockResolvedValue({ error: null });
  const from = vi.fn((table: string) =>
    table === "whatsapp_senders" ? { select } : { upsert },
  );
  mocks.createClient.mockReturnValue({ from });
  return { from, maybeSingle, upsert };
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", secret);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-token");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WhatsApp webhook verification", () => {
  it("returns the challenge only for a matching subscription token", async () => {
    const response = await GET(
      new Request(
        "https://cropnex.example/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("challenge");

    expect(
      (
        await GET(
          new Request(
            "https://cropnex.example/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x",
          ),
        )
      ).status,
    ).toBe(403);
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    expect(
      (
        await GET(
          new Request(
            "https://cropnex.example/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=x",
          ),
        )
      ).status,
    ).toBe(403);
  });
});

describe("WhatsApp webhook POST", () => {
  it("requires an app secret and valid signature before processing payloads", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const notConfigured = await POST(signedRequest("{}"));
    expect(notConfigured.status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();

    vi.stubEnv("WHATSAPP_APP_SECRET", secret);
    const invalid = await POST(signedRequest("{}", "sha256=incorrect"));
    expect(invalid.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires server credentials and rejects signed invalid JSON", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const noSupabase = await POST(signedRequest("{}"));
    expect(noSupabase.status).toBe(503);

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    const malformed = await POST(signedRequest("{"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "Invalid JSON payload.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stores only authorized messages, normalizes senders, and extracts message content", async () => {
    const sender = {
      id: "sender-1",
      user_id: "user-1",
      display_name: "Farm manager",
      default_shed_name: "North Shed",
    };
    const client = configureClient({ data: sender, error: null });
    client.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-id" },
                messages: [
                  { from: "27820000000", timestamp: "1000", type: "text" },
                  { id: "no-sender" },
                  { id: "blocked", from: "27 82 000 0001" },
                  {
                    id: "text",
                    from: "+27 (82) 000-0002",
                    timestamp: "1790812800",
                    type: "text",
                    text: { body: "Rain received" },
                  },
                  {
                    id: "image",
                    from: "2782000003",
                    type: "image",
                    image: {
                      id: "media-1",
                      mime_type: "image/jpeg",
                      filename: "rain.jpg",
                      sha256: "hash",
                      caption: "Gauge at 12 mm",
                    },
                  },
                  {
                    id: "button-reply",
                    from: "2782000004",
                    interactive: { button_reply: { title: "Confirm" } },
                  },
                  {
                    id: "list-reply",
                    from: "2782000005",
                    interactive: { list_reply: { title: "North field" } },
                  },
                  { id: "button", from: "2782000006", button: { text: "Done" } },
                  {
                    id: "location",
                    from: "2782000007",
                    location: {
                      latitude: -26.1,
                      longitude: 28.2,
                      name: "Field gate",
                    },
                  },
                  { id: "empty", from: "2782000008" },
                ],
              },
            },
          ],
        },
      ],
    });

    const response = await POST(signedRequest(raw));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://supabase.example",
      "service-role-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(client.upsert).toHaveBeenCalledTimes(7);
    expect(client.from).toHaveBeenCalledWith("whatsapp_senders");
    expect(client.from).toHaveBeenCalledWith("whatsapp_inbox");
    const stored = client.upsert.mock.calls.map(([value]) => value);
    expect(stored[0]).toMatchObject({
      sender_phone_e164: "+27820000002",
      whatsapp_message_id: "text",
      whatsapp_phone_number_id: "phone-id",
      message_text: "Rain received",
      received_at: "2026-10-01T00:00:00.000Z",
    });
    expect(stored[1]).toMatchObject({
      message_text: "Gauge at 12 mm",
      media_id: "media-1",
      media_mime_type: "image/jpeg",
      media_filename: "rain.jpg",
      media_sha256: "hash",
    });
    expect(stored[2].message_text).toBe("Confirm");
    expect(stored[3].message_text).toBe("North field");
    expect(stored[4].message_text).toBe("Done");
    expect(stored[5].message_text).toBe(
      "Location shared: -26.1, 28.2 · Field gate",
    );
    expect(stored[6]).toMatchObject({
      message_type: "unknown",
      message_text: null,
      received_at: "2026-11-01T00:00:00.000Z",
      default_shed_name: "North Shed",
    });
    for (const [value, options] of client.upsert.mock.calls) {
      expect(options).toEqual({
        onConflict: "whatsapp_message_id",
        ignoreDuplicates: true,
      });
      expect(value.sender_id).toBe("sender-1");
    }
  });

  it("handles absent containers and reports database errors without storing messages", async () => {
    const client = configureClient({ data: null, error: null });
    const empty = await POST(signedRequest("{}"));
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({ received: true });
    expect(client.from).not.toHaveBeenCalled();

    const senderError = configureClient({
      data: null,
      error: new Error("lookup failed"),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lookupFailure = await POST(
      signedRequest(
        JSON.stringify({
          entry: [{ changes: [{ value: { messages: [{ id: "m", from: "1" }] } }] }],
        }),
      ),
    );
    expect(lookupFailure.status).toBe(500);
    expect(senderError.upsert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();

    const insertFailure = configureClient({ data: { id: "s", user_id: "u" }, error: null });
    insertFailure.upsert.mockResolvedValue({ error: new Error("insert failed") });
    const upsertError = await POST(
      signedRequest(
        JSON.stringify({
          entry: [{ changes: [{ value: { messages: [{ id: "m", from: "1" }] } }] }],
        }),
      ),
    );
    expect(upsertError.status).toBe(500);
    await expect(upsertError.json()).resolves.toEqual({
      error: "Could not save the incoming message.",
    });
  });
});
