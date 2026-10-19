export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050b08] p-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
          CropNex Offline
        </p>

        <h1 className="mt-4 text-4xl font-black">
          Connection unavailable
        </h1>

        <p className="mt-4 leading-7 text-gray-400">
          The CropNex interface is available, but live Supabase
          records require an internet connection. Reconnect and
          refresh to continue working with farm data.
        </p>

        <a
          href="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-green-500 px-6 py-3 font-bold text-black"
        >
          Try Again
        </a>
      </section>
    </main>
  );
}
