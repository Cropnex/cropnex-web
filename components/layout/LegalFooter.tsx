import Link from "next/link";
import { APP_NAME, APP_STAGE, APP_VERSION } from "@/lib/app-meta";

export default function LegalFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-5 text-xs text-[#74847b]">
      <p className="mx-auto mb-4 max-w-5xl rounded-lg border border-amber-300/15 bg-amber-300/[.04] px-4 py-3 text-center leading-5 text-[#9caaa2]">
        CropNex outputs, forecasts and recommendations are decision-support estimates only. Verify source data, current field conditions, registered product labels and professional or regulatory requirements before acting.
      </p>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 {APP_NAME}. {APP_STAGE} · v{APP_VERSION}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal">
          <Link className="hover:text-white" href="/legal/terms">Terms</Link>
          <Link className="hover:text-white" href="/legal/privacy">Privacy</Link>
          <Link className="hover:text-white" href="/legal/acceptable-use">Acceptable use</Link>
        </nav>
      </div>
    </footer>
  );
}
