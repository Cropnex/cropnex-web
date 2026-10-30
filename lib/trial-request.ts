/** A rejected or abandoned request must never leave a Trials screen loading indefinitely. */
export function trialRequest<T>(run: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let finished = false;
    const finish = (error?: unknown, value?: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(value as T);
    };
    const cancel = () => { controller.abort(); finish(new Error("Request cancelled")); };
    const timer = setTimeout(() => {
      finish(new Error("CropNex did not respond within 15 seconds. Please try again."));
      controller.abort();
    }, timeoutMs);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    try { Promise.resolve(run(controller.signal)).then(value => finish(undefined, value), error => finish(error)); }
    catch (error) { finish(error); }
  });
}
