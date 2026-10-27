"use client";

import {useState} from "react";

const links=[["#platform","Platform"],["#how","How it works"],["#about","About CropNex"],["#contact","Contact"]];

export default function MobileNav(){
 const[open,setOpen]=useState(false);
 return <div className="relative mx-auto max-w-7xl px-3 pb-3 sm:px-5 md:hidden lg:px-8"><button type="button" aria-expanded={open} aria-controls="cropnex-mobile-navigation" onClick={()=>setOpen(v=>!v)} className="w-fit rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white hover:bg-white/[.08]">{open?"Close menu":"Explore CropNex"}<span className="ml-2" aria-hidden="true">{open?"×":"⌄"}</span></button>{open&&<nav id="cropnex-mobile-navigation" aria-label="Mobile site navigation" className="absolute left-3 right-3 z-50 mt-2 grid gap-1 rounded-xl border border-white/15 bg-[#14261f] p-2 shadow-2xl sm:left-5 sm:right-5">{links.map(([href,label])=><a key={href} href={href} onClick={()=>setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">{label}</a>)}</nav>}</div>
}
