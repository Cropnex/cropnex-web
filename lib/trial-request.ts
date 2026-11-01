/** A rejected or abandoned request must never leave a Trials screen loading indefinitely. */
export function trialRequest<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let finished = false;
    const finish = (
      result: { ok: true; value: T } | { ok: false; error: unknown },
    ) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const cancel = () => {
      controller.abort();
      finish({ ok: false, error: new Error("Request cancelled") });
    };
    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: new Error(
          "CropNex did not respond within 15 seconds. Please try again.",
        ),
      });
      controller.abort();
    }, timeoutMs);
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      Promise.resolve(run(controller.signal)).then(
        (value) => finish({ ok: true, value }),
        (error) => finish({ ok: false, error }),
      );
    } catch (error) {
      finish({ ok: false, error });
    }
  });
}
