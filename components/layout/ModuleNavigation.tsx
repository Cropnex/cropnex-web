import Link from "next/link";

type ModuleLink = {
  href: string;
  title: string;
  description: string;
  icon: string;
};

const modules: ModuleLink[] = [
  {
    href: "/farm-map",
    title: "Farm Map",
    description: "Boundaries, hectares and field activities",
    icon: "🗺️",
  },
  {
    href: "/fields",
    title: "Fields",
    description: "Crops, seasons, cultivars and yield targets",
    icon: "🌾",
  },
  {
    href: "/activities",
    title: "Activities",
    description: "Spraying, planting, fertilising and scouting",
    icon: "📋",
  },
  {
    href: "/jobs",
    title: "Job Cards",
    description: "Plan jobs and deduct stock on completion",
    icon: "✅",
  },
  {
    href: "/equipment",
    title: "Equipment",
    description: "Machinery, hours and service history",
    icon: "🚜",
  },
  {
    href: "/inventory",
    title: "Inventory",
    description: "Chemicals, fertiliser, seed, diesel and parts",
    icon: "📦",
  },
  {
    href: "/labour",
    title: "Labour",
    description: "Employees, hours and field labour costs",
    icon: "👨‍🌾",
  },
  {
    href: "/weather",
    title: "Weather",
    description: "Field forecasts, rainfall and modelled spray guidance",
    icon: "🌦️",
  },
  {
    href: "/harvest",
    title: "Harvest",
    description: "Tonnes, moisture, yield and crop income",
    icon: "🌽",
  },
  {
    href: "/financials",
    title: "Financials",
    description: "Income, expenses, budgets and gross margin",
    icon: "💰",
  },
  {
    href: "/grain-marketing",
    title: "Grain Marketing",
    description: "Contracts, futures, options and exposure",
    icon: "📈",
  },
  {
    href: "/reports",
    title: "Reports",
    description: "Consolidated farm analytics and alerts",
    icon: "📊",
  },
];

export default function ModuleNavigation() {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">CropNex Modules</h2>
        <p className="mt-1 text-sm text-gray-400">
          Open any part of your farm management system.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:-translate-y-0.5 hover:border-green-500/40 hover:bg-green-500/5"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{module.icon}</div>

              <div>
                <h3 className="text-xl font-bold text-green-400">
                  {module.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-400">
                  {module.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
