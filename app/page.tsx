import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import CropNexLogo from "@/components/brand/CropNexLogo";
import MobileNav from "@/components/landing/MobileNav";
import { InventoryPreview, MapPreview, SeasonPreview } from "@/components/landing/ProductPreviews";
import { CROPNEX_LAUNCHED } from "@/lib/app-meta";

const landingTitle = "CropNex | Field intelligence for modern farming";
const landingDescription =
  "See how CropNex connects field maps, seasonal planning, activities, sheds and inventory, harvest, transport and farm reporting in one workspace.";

export const metadata: Metadata = {
  title: landingTitle,
  description: landingDescription,
  openGraph: {
    title: landingTitle,
    description: landingDescription,
    url: "https://www.cropnex.com",
    siteName: "CropNex",
    images: [
      {
        url: "/marketing/cropnex-launch-og.png",
        width: 1080,
        height: 1080,
        alt: "CropNex — a clearer view of every field",
      },
    ],
    locale: "en_ZA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: landingTitle,
    description: landingDescription,
    images: ["/marketing/cropnex-launch-og.png"],
  },
};

const capabilities = [
  { icon: "⌖", title: "Your fields, on the map", copy: "Review field boundaries, crops, seasons and field details from a single farm map. Open a field to inspect its information and carry the same field context into planning." },
  { icon: "✓", title: "Plan work before it starts", copy: "Build seasonal programmes around crops and fields. Keep planned activities and their products or operations together so the team can see what work is coming up." },
  { icon: "▣", title: "Connect field work to the shed", copy: "Record stock by shed, track movements and stock checks, and use product records alongside field activities. Get a clearer picture of what is available and where it is stored." },
  { icon: "◆", title: "Follow harvest and deliveries", copy: "Keep harvest records, field tonnages and transport loads connected to the season. Review deliveries and field progress as harvest moves along." },
  { icon: "R", title: "See the business around the crop", copy: "Bring budgets, income, costs, commitments and field performance reports into the same farm workspace. Use the records you capture to support better seasonal decisions." },
  { icon: "AI", title: "Keep useful farm context together", copy: "Bring scouting, weather, rainfall, equipment, fuel and job records into one place. CropNex also includes an AI Assistant and document scanner to help explore farm information and identify details such as dates and net tonnes on transport notes. Always review AI results before using them." },
];

const accessSteps = [
  ["Create your account", "Set up a CropNex profile with your name and farm or business."],
  ["Tell us about your operation", "Choose the access you need and submit your request for review."],
  ["CropNex reviews each request", "We check account applications individually before enabling farm access."],
  ["Start setting up your workspace", "Once approved, sign in to build your farm records and season workspace."],
];

export default function HomePage() {
  return <main className="min-h-screen overflow-hidden bg-[var(--brand-forest)] text-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--brand-forest)]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-5 lg:px-8">
        <Link href="/" aria-label="CropNex home"><span className="inline-flex items-center gap-2 sm:hidden"><CropNexLogo compact tagline={false}/><b className="font-display text-xl font-extrabold tracking-[-.055em] text-white">Crop<span className="text-[var(--brand-leaf-light)]">Nex</span></b></span><span className="hidden sm:inline-flex"><CropNexLogo /></span></Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-white/70 md:flex">
          <a href="#features" className="hover:text-white">What it does</a><a href="#inside" className="hover:text-white">Inside CropNex</a><a href="#access" className="hover:text-white">Request access</a>
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3"><Link href="/login" className="rounded-lg px-2 py-2 text-xs font-semibold text-white/80 hover:text-white sm:px-0 sm:text-sm">Log in</Link><Link href={CROPNEX_LAUNCHED ? "/login?mode=register" : "/login?mode=register&presubscribe=1"} className="rounded-xl bg-[var(--brand-leaf)] px-3 py-2.5 text-xs font-bold text-[var(--brand-forest)] transition hover:bg-[var(--brand-leaf-light)] sm:px-5 sm:text-sm">{CROPNEX_LAUNCHED ? "Create account" : "Pre-subscribe"}</Link></div>
      </div>
      <MobileNav />
    </header>

    <section className="relative isolate min-h-[660px] overflow-hidden">
      <Image src="/marketing/cropnex-landing-hero.png" alt="Sunrise across cultivated fields" fill priority sizes="100vw" className="-z-20 object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--brand-forest)] via-[var(--brand-forest)]/85 to-[var(--brand-forest)]/15" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--brand-forest)]/75 via-transparent to-[var(--brand-forest)]/10" />
      <div className="mx-auto grid min-h-[660px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1fr_.82fr] lg:px-8">
        <div className="max-w-3xl">
          <p className="ag-kicker">Field intelligence for the whole operation</p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.02] md:text-7xl">A clearer view of every field.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/78">From field boundaries and seasonal plans to shed stock, harvest records and business reports, CropNex brings the moving parts of your farm into one connected workspace.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href={CROPNEX_LAUNCHED ? "/login?mode=register" : "/login?mode=register&presubscribe=1"} className="rounded-xl bg-[var(--brand-leaf)] px-7 py-4 font-extrabold text-[var(--brand-forest)] hover:bg-[var(--brand-leaf-light)]">{CROPNEX_LAUNCHED ? "Create an account & request access" : "Pre-subscribe to CropNex"}</Link><a href="#inside" className="rounded-xl border border-white/25 bg-white/5 px-7 py-4 font-bold backdrop-blur hover:bg-white/10">Take a look inside</a></div>
          <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-white/75">Every account is reviewed by CropNex before farm access is approved. Create a profile to request access.</p>
          <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-white/85"><span>Map fields</span><span>Plan the season</span><span>Track shed stock</span><span>Follow harvest</span></div>
        </div>
        <FieldIllustration />
      </div>
    </section>

    <section id="features" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
      <div className="max-w-3xl"><p className="ag-kicker">One workspace for the farm operation</p><h2 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Know what is happening across every field.</h2><p className="mt-5 text-lg leading-8 text-white/70">CropNex connects land, seasonal work, stock, harvest and business records around the farms and fields you manage.</p></div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map((feature,index)=><article key={feature.title} className="rounded-2xl border border-white/10 bg-white/[.045] p-5 sm:p-6"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-leaf)]/15 text-lg font-extrabold text-[var(--brand-leaf-light)]">{feature.icon}</span><p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.18em] text-white/40">0{index+1}</p><h3 className="mt-2 text-xl font-bold">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-white/65">{feature.copy}</p></article>)}</div>
    </section>

    <section id="inside" className="bg-[#f1f2ed] text-[#19231c]"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#5d882e]">Inside CropNex</p><h2 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">A closer look at the workspace.</h2><p className="mt-5 text-lg leading-8 text-slate-600">Explore the main workflows—from seeing the farm on a map to planning field work and checking shed records.</p></div>
      <div className="mt-12 grid items-center gap-8 lg:grid-cols-[1.08fr_.92fr]"><div><MapPreview /></div><div className="max-w-xl"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#5d882e]">01 · Farm map and fields</p><h3 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">Start with the land you manage.</h3><p className="mt-4 leading-7 text-slate-600">Review mapped boundaries and field details, then use each field as the reference point for crop, season and work records. A clear field view helps bring planning and day-to-day activity together.</p><a href="#access" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#4d7b23] hover:text-[#2d5712]">Request account access <span aria-hidden="true">→</span></a></div></div>
      <div className="mt-16 grid items-center gap-8 lg:grid-cols-[.92fr_1.08fr]"><div className="order-2 max-w-xl lg:order-1"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#5d882e]">02 · Seasonal planning</p><h3 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">Keep the plan connected to field work.</h3><p className="mt-4 leading-7 text-slate-600">Build a programme by season and field. Keep activities, products and operations visible, then record completed work so planned and actual farm activity can be reviewed together.</p><p className="mt-4 text-sm font-semibold text-slate-500">CropNex keeps the season programme close to the field context.</p></div><div className="order-1 lg:order-2"><SeasonPreview /></div></div>
      <div className="mt-16 grid items-center gap-8 lg:grid-cols-[1.08fr_.92fr]"><div><InventoryPreview /></div><div className="max-w-xl"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#5d882e]">03 · Sheds and inventory</p><h3 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">Give every input a place in the season.</h3><p className="mt-4 leading-7 text-slate-600">Organise products by shed, review stock movements and record usage alongside farm activities. CropNex helps connect what is held in inventory with the work planned for the fields.</p><p className="mt-4 text-sm font-semibold text-slate-500">See inventory locations, receipts and usage in one workflow.</p></div></div>
      <p className="mt-8 text-center text-xs text-slate-500">These are illustrative CropNex screen previews with sample content, not live farm data.</p>
    </div></section>

    <section className="relative isolate overflow-hidden"><Image src="/marketing/cropnex-field-landscape.png" alt="Golden-hour view across cultivated fields and farm silos" fill sizes="100vw" className="-z-20 object-cover object-center"/><div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#111916]/95 via-[#111916]/75 to-[#111916]/20"/><div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1fr_.8fr] lg:px-8 lg:py-28"><div className="max-w-2xl"><p className="ag-kicker">From field to season close</p><h2 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Keep the records that help you make the next decision.</h2><p className="mt-5 text-lg leading-8 text-white/75">Harvest, transport, weather and business records can be reviewed alongside the season’s field activity. CropNex gives your farm a shared place to capture the work and follow the results.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><ValueLine title="Harvest & transport" text="Record tonnes, loads and field progress."/><ValueLine title="Business & reports" text="Bring budgets, transactions and field performance together for review."/><ValueLine title="Farm operations" text="Keep scouting, jobs, equipment and rainfall records close at hand."/></div></div></section>

    <section id="access" className="border-y border-white/10 bg-white/[.025]"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24"><div className="max-w-3xl"><p className="ag-kicker">Request CropNex access</p><h2 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Create your profile. We’ll review your request.</h2><p className="mt-5 text-lg leading-8 text-white/65">CropNex is currently reviewing accounts individually. Register your farm or business and tell us what access you need. Our team will review your application before enabling the farm workspace.</p></div><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{accessSteps.map(([title,text],index)=><div key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><span className="text-xs font-extrabold text-[var(--brand-leaf-light)]">STEP 0{index+1}</span><h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{text}</p></div>)}</div><div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl bg-[var(--brand-forest-soft)] p-6 sm:flex-row sm:items-center sm:p-8"><div><h3 className="text-2xl font-extrabold">Ready to request access?</h3><p className="mt-2 text-sm leading-6 text-white/65">Create your CropNex profile to begin the review process.</p></div><Link href={CROPNEX_LAUNCHED ? "/login?mode=register" : "/login?mode=register&presubscribe=1"} className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--brand-leaf)] px-6 py-4 text-center font-extrabold text-[var(--brand-forest)] transition hover:bg-[var(--brand-leaf-light)] sm:w-auto">Create account & request access</Link></div></div></section>

    <section id="about" className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]"><div><p className="ag-kicker">About CropNex</p><h2 className="mt-3 max-w-2xl text-4xl font-extrabold leading-tight">Built to make farm information easier to use.</h2></div><p className="self-end text-lg leading-8 text-white/65">CropNex is a farm-management workspace for the people, land and decisions behind each season. It brings everyday operational records into a clear, connected view for the farm team.</p></div></section>

    <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8"><div className="relative overflow-hidden rounded-[2rem] bg-[var(--brand-leaf)] p-8 text-[var(--brand-forest)] md:p-12"><div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl"/><div className="relative flex flex-wrap items-end justify-between gap-7"><div><p className="text-xs font-extrabold uppercase tracking-[.18em]">CropNex</p><h2 className="mt-3 max-w-2xl text-4xl font-extrabold">Bring the season and the operation into focus.</h2><p className="mt-4 max-w-xl">Create your profile and request access. Every account is reviewed before farm access is approved.</p></div><Link href={CROPNEX_LAUNCHED ? "/login?mode=register" : "/login?mode=register&presubscribe=1"} className="rounded-xl bg-[var(--brand-forest)] px-7 py-4 font-bold text-white">Create account & request access</Link></div></div></section>

    <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-8 text-sm text-white/55 lg:px-8"><div className="flex flex-wrap items-center gap-5"><Link href="/" aria-label="CropNex home"><CropNexLogo /></Link><div><p>© {new Date().getFullYear()} CropNex</p><p className="mt-1 text-xs">Operated by CROPNEX (PTY) LTD · Registration 2026/452524/07</p></div></div><div className="flex flex-wrap gap-5"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/acceptable-use">Acceptable use</Link><Link href="/login" className="font-bold text-[var(--brand-leaf-light)]">Login</Link></div></div></footer>
  </main>;
}

function ValueLine({title,text}:{title:string;text:string}){return <div className="rounded-2xl border border-white/15 bg-[#15211a]/75 p-5 backdrop-blur"><p className="font-extrabold text-[var(--brand-leaf-light)]">{title}</p><p className="mt-1 text-sm leading-6 text-white/70">{text}</p></div>}

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
      <circle cx="470" cy="54" r="18" fill="#14261f" stroke="#9bdd4c" strokeWidth="2"/><path d="M470 43v22m-8-11h16" stroke="#dce1e3" strokeWidth="2"/>
    </svg>
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-2 pt-4 text-xs text-white/60"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#809f63]"/>Loam</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#d5a24a]"/>Clay</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#c5bc7e]"/>Sandy</span></div>
  </div>;
}
