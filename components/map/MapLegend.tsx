export default function MapLegend({items}:{items:{label:string;colour:string}[]}) {
 return <div aria-label="Crop colour legend" className="flex flex-wrap gap-2 border-t border-white/10 p-3 text-[11px] text-[#d0dfd4]">{items.map(item=><div key={item.label+item.colour} className="flex items-center gap-2 rounded-full bg-white/5 px-2 py-1.5"><span className="h-3 w-3 rounded-full border border-white/30" style={{background:item.colour}}/>{item.label}</div>)}{!items.length&&<span>No crops in this view</span>}</div>;
}
