type Props = { compact?: boolean; className?: string; tagline?: boolean };

export default function CropNexLogo({ compact = false, className = "", tagline = true }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 240 240" aria-hidden="true" className={compact ? "h-10 w-10 shrink-0" : "h-12 w-12 shrink-0"}>
        <defs>
          <linearGradient id="cropnex-growing-row-green" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#B2E45C" />
            <stop offset=".55" stopColor="#83CE32" />
            <stop offset="1" stopColor="#5DAA2D" />
          </linearGradient>
          <linearGradient id="cropnex-growing-row-silver" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#F0F2F3" />
            <stop offset="1" stopColor="#AEB7BC" />
          </linearGradient>
        </defs>
        <path d="M191 54a99 99 0 1 0 13 111" fill="none" stroke="url(#cropnex-growing-row-green)" strokeWidth="12" strokeLinecap="round" />
        <path d="M121 87c-20-1-34-15-34-34 19-1 33 12 35 32Zm7-5c2-22 17-35 37-32-1 20-15 33-37 35Z" fill="url(#cropnex-growing-row-green)" />
        <path d="M124 84v59" fill="none" stroke="url(#cropnex-growing-row-silver)" strokeWidth="8" strokeLinecap="round" />
        <path d="M61 149c37-18 87-18 124 0M74 173c31-12 67-12 98 0M91 194c20-7 44-7 64 0" fill="none" stroke="url(#cropnex-growing-row-silver)" strokeWidth="8" strokeLinecap="round" />
      </svg>
      {!compact && <span>
        <b className="font-display block text-2xl font-extrabold leading-none tracking-[-.055em] text-white">Crop<span className="text-[var(--brand-leaf-light)]">Nex</span></b>
        {tagline && <small className="mt-1 block whitespace-nowrap text-[8px] font-bold uppercase tracking-[.2em] text-white/55">Field intelligence</small>}
      </span>}
    </span>
  );
}
