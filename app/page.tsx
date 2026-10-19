import Image from "next/image";
import Link from "next/link";
import CropNexLogo from "@/components/brand/CropNexLogo";

const features = [
  ["01", "Plan the season", "Build field plans, schedules, activities and budgets around the work ahead."],
  ["02", "Know every field", "Bring boundaries, soil classes, scouting and satellite insights into one farm view."],
  ["03", "Keep stock in control", "Track inputs, shed movements, equipment, fuel and delivery records."],
  ["04", "Follow harvest through", "Connect field work, transport loads, contracts and harvest results."],
  ["05", "Understand performance", "Compare planned and actual costs, yields, income and field margins."],
  ["06", "Work together", "Give farmers and teams the information and access they need for their role."],
];

const steps = [
  ["Map", "Set up farms and review field boundaries."],
  ["Plan", "Choose the season, crops and field activities."],
  ["Record", "Capture work, stock, weather and harvest as it happens."],
  ["Decide", "Use connected records to guide the next move."],
];

export default function HomePage() {
  return <main className="min-h-screen overflow-hidden bg-[var(--brand-forest)] text-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--brand-forest)]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
        <Link href="/" aria-label="CropNex home"><CropNexLogo /></Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-white/70 md:flex">
          <a href="#platform" className="hover:text-white">Platform</a><a href="#how" className="hover:text-white">How it works</a><a href="#about" className="hover:text-white">About</a>
        </nav>
        <Link href="/login" className="rounded-xl bg-[var(--brand-leaf)] px-5 py-2.5 text-sm font-bold text-[var(--brand-forest)] transition hover:bg-[var(--brand-leaf-light)]">Log in</Link>
      </div>
    </header>

    <section className="relative isolate min-h-[660px] overflow-hidden">
      <Image src="/marketing/cropnex-field-landscape.png" alt="Sunrise over cultivated farmland" fill priority sizes="100vw" className="-z-20 object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--brand-forest)] via-[var(--brand-forest)]/85 to-[var(--brand-forest)]/15" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--brand-forest)]/75 via-transparent to-[var(--brand-forest)]/10" />
      <div className="mx-auto grid min-h-[660px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1fr_.82fr] lg:px-8">
        <div className="max-w-3xl">
          <p className="ag-kicker">Field intelligence for the whole operation</p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.02] md:text-7xl">A clearer view of every field.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/78">CropNex brings field planning, farm records, inventory, equipment, harvest and financial insight into one connected workspace.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/login" className="rounded-xl bg-[var(--brand-leaf)] px-7 py-4 font-extrabold text-[var(--brand-forest)] hover:bg-[var(--brand-leaf-light)]">Open CropNex</Link><a href="#platform" className="rounded-xl border border-white/25 bg-white/5 px-7 py-4 font-bold backdrop-blur hover:bg-white/10">Explore the platform</a></div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/75"><span>Season-aware planning</span><span>Field-to-harvest records</span><span>Works offline</span></div>
        </div>
        <FieldIllustration />
      </div>
    </section>

    <section id="platform" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
      <div className="max-w-3xl"><p className="ag-kicker">One connected farm workspace</p><h2 className="mt-3 text-4xl font-extrabold md:text-5xl">From the soil to the season’s result.</h2><p className="mt-5 text-lg leading-8 text-white/65">Each part of the operation shares the same field, farm and season context, helping teams keep their records aligned.</p></div>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([number, title, text]) => <article key={number} className="rounded-2xl border border-white/10 bg-white/[.045] p-6 transition hover:-translate-y-1 hover:border-[var(--brand-leaf)]/50"><span className="text-xs font-extrabold text-[var(--brand-gold)]">{number}</span><h3 className="mt-6 text-2xl font-bold">{title}</h3><p className="mt-3 leading-7 text-white/65">{text}</p></article>)}</div>
      <div className="mt-14 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="relative min-h-[370px] overflow-hidden rounded-[2rem] border border-white/10"><Image src="/marketing/cropnex-field-landscape.png" alt="Cultivated fields at first light" fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-[var(--brand-forest)] via-[var(--brand-forest)]/20 to-transparent"/><div className="absolute bottom-0 p-7 md:p-9"><p className="ag-kicker">One operational picture</p><h3 className="mt-2 max-w-xl text-3xl font-extrabold">See the land, the work and the season together.</h3></div></div>
        <div className="flex flex-col justify-center rounded-[2rem] border border-white/10 bg-[var(--brand-forest-soft)] p-7 md:p-9"><p className="ag-kicker">Designed for real farm work</p><h3 className="mt-3 text-3xl font-extrabold">Useful on the farm, clear at the desk.</h3><p className="mt-4 leading-7 text-white/65">Capture field activity where it happens. Review connected records when it is time to plan, check stock or understand performance.</p><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-white/[.04] p-4"><span className="text-2xl text-[var(--brand-leaf-light)]">⌖</span><p className="mt-3 font-bold">Field-first</p><p className="mt-1 text-xs leading-5 text-white/55">Boundaries, seasons and observations</p></div><div className="rounded-xl border border-white/10 bg-white/[.04] p-4"><span className="text-2xl text-[var(--brand-gold)]">↗</span><p className="mt-3 font-bold">Connected</p><p className="mt-1 text-xs leading-5 text-white/55">Plans, records and results together</p></div></div></div>
      </div>
    </section>

    <section id="how" className="border-y border-white/10 bg-white/[.025]"><div className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><p className="ag-kicker">A simple operating rhythm</p><h2 className="mt-3 text-4xl font-extrabold">One step informs the next.</h2><div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">{steps.map(([title, text], index) => <div key={title}><span className="grid h-11 w-11 place-items-center rounded-full border border-[var(--brand-leaf)]/50 bg-[var(--brand-leaf)]/15 font-bold text-[var(--brand-leaf-light)]">{index + 1}</span><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-white/60">{text}</p></div>)}</div></div></section>

    <section id="about" className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]"><div><p className="ag-kicker">About CropNex</p><h2 className="mt-3 max-w-2xl text-4xl font-extrabold">Better information should make farming simpler.</h2></div><p className="self-end text-lg leading-8 text-white/65">CropNex is a practical farm-management workspace for the people, land and decisions behind each season.</p></div></section>

    <section id="contact" className="mx-auto max-w-7xl px-5 pb-24 lg:px-8"><div className="relative overflow-hidden rounded-[2rem] bg-[var(--brand-leaf)] p-8 text-[var(--brand-forest)] md:p-12"><div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl"/><div className="relative flex flex-wrap items-end justify-between gap-7"><div><p className="text-xs font-extrabold uppercase tracking-[.18em]">CropNex</p><h2 className="mt-3 max-w-2xl text-4xl font-extrabold">Bring the season and the operation into focus.</h2><p className="mt-4 max-w-xl">Sign in to continue to your secure CropNex workspace.</p></div><Link href="/login" className="rounded-xl bg-[var(--brand-forest)] px-7 py-4 font-bold text-white">Log in to CropNex</Link></div></div></section>

    <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-8 text-sm text-white/55 lg:px-8"><p>© {new Date().getFullYear()} CropNex</p><div className="flex flex-wrap gap-5"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/acceptable-use">Acceptable use</Link><Link href="/login" className="font-bold text-[var(--brand-leaf-light)]">Login</Link></div></div></footer>
  </main>;
}

function FieldIllustration() {
  return <div className="relative mx-auto w-full max-w-[580px] rounded-[2rem] border border-white/15 bg-[var(--brand-forest)]/85 p-4 shadow-2xl backdrop-blur-xl">
    <div className="flex items-center justify-between gap-3 px-2 pb-4"><div><p className="text-xs uppercase tracking-[.16em] text-white/50">CropNex map view</p><h2 className="mt-1 text-lg font-bold">Field layers</h2></div><span className="rounded-full bg-[var(--brand-leaf)]/15 px-3 py-1.5 text-xs font-bold text-[var(--brand-leaf-light)]">Soil classes</span></div>
    <svg viewBox="0 0 560 390" role="img" aria-label="Illustration of connected field boundaries and soil classes" className="w-full rounded-2xl bg-[#203b2d]">
      <defs><pattern id="field-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#f4f0df" strokeOpacity=".08" strokeWidth="1"/></pattern></defs>
      <path d="M0 0h560v390H0z" fill="url(#field-grid)"/>
      <path d="m30 58 144-32 44 93-150 36z" fill="#809f63" stroke="#e5d8b4" strokeWidth="3"/><path d="m174 26 164-8 36 109-156-8z" fill="#d5a24a" stroke="#e5d8b4" strokeWidth="3"/>
      <path d="m218 119 156 8 26 104-154 22z" fill="#628b70" stroke="#e5d8b4" strokeWidth="3"/><path d="m68 155 150-36 28 134-126 37z" fill="#c5bc7e" stroke="#e5d8b4" strokeWidth="3"/>
      <path d="m120 290 126-37 154-22 56 114-190 25z" fill="#748c59" stroke="#e5d8b4" strokeWidth="3"/><path d="m378 127 112-13 61 139-95 92-56-114z" fill="#9a7950" stroke="#e5d8b4" strokeWidth="3"/>
      <path d="M20 344c95-58 171-44 256-4s156 25 264-77" fill="none" stroke="#a5c179" strokeWidth="2" strokeDasharray="6 7"/>
      <g fill="#fff" fontFamily="sans-serif" fontSize="12" fontWeight="700"><text x="91" y="111">North · loam</text><text x="237" y="82">East · clay</text><text x="268" y="188">Central · loam</text><text x="154" y="223">South · sandy</text><text x="246" y="328">West · loam</text><text x="418" y="218">Hill · clay</text></g>
      <circle cx="470" cy="54" r="18" fill="#14261f" stroke="#d6a64c" strokeWidth="2"/><path d="M470 43v22m-8-11h16" stroke="#e5bf70" strokeWidth="2"/>
    </svg>
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-2 pt-4 text-xs text-white/60"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#809f63]"/>Loam</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#d5a24a]"/>Clay</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#c5bc7e]"/>Sandy</span></div>
  </div>;
}
