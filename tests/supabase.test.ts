import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createOfflineFetch: vi.fn(),
  offlineFetch: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/offline-platform", () => ({
  createOfflineFetch: mocks.createOfflineFetch,
}));

beforeEach(() => {
  mocks.createClient.mockReturnValue({ auth: {} });
  mocks.createOfflineFetch.mockReturnValue(mocks.offlineFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Supabase client configuration", () => {
  it("uses the configured public URL and key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://configured.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "configured-public-key");

    const client = await import("@/lib/supabase");

    expect(client.supabaseUrl).toBe("https://configured.example.test");
    expect(client.supabaseAnonKey).toBe("configured-public-key");
    expect(mocks.createOfflineFetch).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://configured.example.test",
      "configured-public-key",
      expect.objectContaining({
        global: { fetch: mocks.offlineFetch },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  });

  it("uses the built-in public defaults when the environment is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const client = await import("@/lib/supabase");

    expect(client.supabaseUrl).toBe("https://your-project.supabase.co");
    expect(client.supabaseAnonKey).toBe("your-publishable-anon-key");
  });
});
