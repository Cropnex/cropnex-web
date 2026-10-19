import Link from "next/link";
import { APP_NAME, APP_STAGE, APP_VERSION, LEGAL_VERSION, COMPANY_NAME, COMPANY_REGISTRATION } from "@/lib/app-meta";

export default function LegalDocument({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#050b08] px-5 py-10 text-white sm:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#0b1712] p-6 shadow-2xl sm:p-10">
        <Link href="/login" className="text-sm font-bold text-[#91d447] hover:underline">← Back to CropNex</Link>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#91d447]">{APP_NAME} · {APP_STAGE} · v{APP_VERSION}</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl leading-7 text-[#9aaba1]">{summary}</p>
        <p className="mt-3 text-xs text-[#6f8177]">Effective 25 September 2026 · Policy version {LEGAL_VERSION}</p>
        <p className="mt-1 text-xs text-[#6f8177]">Service provider: {COMPANY_NAME} · Registration {COMPANY_REGISTRATION}</p>
        <div className="prose prose-invert mt-10 max-w-none prose-headings:text-white prose-h2:mt-10 prose-h2:text-2xl prose-p:leading-7 prose-p:text-[#b7c3bc] prose-li:text-[#b7c3bc] prose-a:text-[#91d447]">
          {children}
        </div>
        <div className="mt-12 flex flex-wrap gap-5 border-t border-white/10 pt-6 text-sm">
          <Link className="text-[#91d447] hover:underline" href="/legal/terms">Terms</Link>
          <Link className="text-[#91d447] hover:underline" href="/legal/privacy">Privacy</Link>
          <Link className="text-[#91d447] hover:underline" href="/legal/acceptable-use">Acceptable use</Link>
        </div>
      </article>
    </main>
  );
}
