type Props={compact?:boolean;className?:string;tagline?:boolean};

export default function CropNexLogo({compact=false,className="",tagline=true}:Props){
  return <span className={`inline-flex items-center gap-3 ${className}`}>
    <svg viewBox="0 0 88 72" aria-hidden="true" className={compact?"h-9 w-11 shrink-0":"h-12 w-14 shrink-0"}>
      <defs><linearGradient id="cropnex-mark" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b7e86e"/><stop offset="1" stopColor="#62a92f"/></linearGradient></defs>
      <path d="M44 5 78 24v24L44 67 10 48V24Z" fill="none" stroke="url(#cropnex-mark)" strokeWidth="5" strokeLinejoin="round"/>
      <path d="M24 44c0-12 9-21 21-21 7 0 13 3 17 8M25 47c8-1 17-5 25-14M34 57c3-7 7-13 13-19" fill="none" stroke="#83c341" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="61" cy="31" r="4" fill="#fff" stroke="#83c341" strokeWidth="2"/>
    </svg>
    {!compact&&<span><b className="block text-2xl font-black leading-none tracking-[-.055em] text-white">Crop<span className="text-[#83c341]">Nex</span></b>{tagline&&<small className="mt-1 block whitespace-nowrap text-[8px] font-bold uppercase tracking-[.22em] text-[#7f9187]">Farm Management</small>}</span>}
  </span>;
}
