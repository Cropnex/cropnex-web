type Props = { compact?: boolean; className?: string; tagline?: boolean };

export default function CropNexLogo({ compact = false, className = "", tagline = true }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 72 72" aria-hidden="true" className={compact ? "h-10 w-10 shrink-0" : "h-12 w-12 shrink-0"}>
        <defs>
          <linearGradient id="cropnex-field-mark" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b8ce83" />
            <stop offset="1" stopColor="#789b58" />
          </linearGradient>
        </defs>
        <path d="M9 52 36 66l27-14V26L36 11 9 26Z" fill="none" stroke="url(#cropnex-field-mark)" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M16 48c10 1 20-1 29-7 5-3 9-7 12-12M17 54c9-1 17-4 24-9 4-3 8-6 11-10M23 59c7-2 13-5 19-9M28 27c4-6 11-9 17-7 5 1 8 4 10 8" fill="none" stroke="#d6a64c" strokeWidth="2.7" strokeLinecap="round" />
        <circle cx="49" cy="20" r="3.5" fill="#d6a64c" />
      </svg>
      {!compact && <span>
        <b className="block text-2xl font-extrabold leading-none tracking-[-.055em] text-white">Crop<span className="text-[var(--brand-leaf-light)]">Nex</span></b>
        {tagline && <small className="mt-1 block whitespace-nowrap text-[8px] font-bold uppercase tracking-[.2em] text-white/55">Field intelligence</small>}
      </span>}
    </span>
  );
}
