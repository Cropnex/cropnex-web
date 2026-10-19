type LegendItem = {
  label: string;
  colorClass: string;
};

const items: LegendItem[] = [
  { label: "White Maize", colorClass: "bg-slate-200" },
  { label: "Yellow Maize", colorClass: "bg-yellow-300" },
  { label: "Sunflower", colorClass: "bg-orange-400" },
  { label: "Wheat", colorClass: "bg-amber-500" },
  { label: "Other", colorClass: "bg-blue-500" },
];

export default function MapLegend() {
  return (
    <div className="flex flex-wrap gap-2 border-t border-white/[0.07] p-3 text-[10px] text-[#91a198]">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-1.5"
        >
          <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
