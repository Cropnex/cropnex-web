import { afterEach, describe, expect, it, vi } from "vitest";
import { getOfflineFields, saveFieldsOffline } from "@/lib/offline-fields";

describe("offline field cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves fields under a user-specific key with a timestamp", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const fields = [{ id: "field-1", field_name: "North" }] as never[];

    saveFieldsOffline("user-1", fields);

    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem.mock.calls[0][0]).toBe("agcore-fields-user-1");
    const stored = JSON.parse(setItem.mock.calls[0][1]);
    expect(stored.fields).toEqual(fields);
    expect(Number.isNaN(Date.parse(stored.saved_at))).toBe(false);
  });

  it("returns an empty list when no cache exists or the cache has a non-array value", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce('{"fields":{}}'),
    });
    expect(getOfflineFields("user-1")).toEqual([]);
    expect(getOfflineFields("user-1")).toEqual([]);
  });

  it("returns cached fields and logs malformed storage before returning an empty list", () => {
    const fields = [{ id: "field-1" }];
    const getItem = vi
      .fn()
      .mockReturnValueOnce(JSON.stringify({ saved_at: "2026-01-01", fields }))
      .mockReturnValueOnce("{");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("localStorage", { getItem });

    expect(getOfflineFields("user-1")).toEqual(fields);
    expect(getOfflineFields("user-1")).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
