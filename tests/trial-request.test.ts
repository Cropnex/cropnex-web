import { afterEach, describe, expect, it, vi } from "vitest";
import { trialRequest } from "@/lib/trial-request";

afterEach(() => {
  vi.useRealTimers();
});

describe("trialRequest", () => {
  it("passes an abort signal through and resolves successful thenables", async () => {
    let requestSignal: AbortSignal | undefined;
    await expect(
      trialRequest((signal) => {
        requestSignal = signal;
        return Promise.resolve("loaded");
      }),
    ).resolves.toBe("loaded");
    expect(requestSignal?.aborted).toBe(false);
  });

  it("propagates synchronous throws and promise rejection reasons", async () => {
    const thrown = new Error("sync failure");
    await expect(
      trialRequest(() => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    for (const reason of [new Error("async failure"), null, undefined]) {
      await expect(trialRequest(() => Promise.reject(reason))).rejects.toBe(
        reason,
      );
    }
  });

  it("does not start a request when its signal was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(() => Promise.resolve("not run"));

    await expect(trialRequest(run, controller.signal)).rejects.toThrow(
      "Request cancelled",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("ignores cancellation after a request has already settled", async () => {
    const controller = new AbortController();
    const request = trialRequest(
      () => Promise.resolve("loaded"),
      controller.signal,
    );

    await expect(request).resolves.toBe("loaded");
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("aborts an in-flight request when the caller cancels", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const request = trialRequest((signal) => {
      requestSignal = signal;
      return new Promise<string>(() => {});
    }, controller.signal);

    controller.abort();
    await expect(request).rejects.toThrow("Request cancelled");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("aborts a timed-out request and reports the timeout", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    let resolveRequest: ((value: string) => void) | undefined;
    const request = trialRequest(
      (signal) => {
        requestSignal = signal;
        return new Promise<string>((resolve) => {
          resolveRequest = resolve;
        });
      },
      undefined,
      10,
    );
    const rejection = expect(request).rejects.toThrow(
      "CropNex did not respond within 15 seconds. Please try again.",
    );

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    resolveRequest?.("late response");
    await Promise.resolve();
  });
});
