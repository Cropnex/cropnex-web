import Link from "next/link";
import type { SmartAlert } from "@/types/alerts";

export default function AlertCard({
  alert,
}: {
  alert: SmartAlert;
}) {
  const styles = {
    info: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    warning:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",
    critical:
      "border-red-500/20 bg-red-500/10 text-red-400",
  }[alert.severity];

  return (
    <Link
      href={alert.href}
      className={`block rounded-2xl border p-5 transition hover:-translate-y-0.5 ${styles}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-75">
            {alert.category}
          </p>
          <h3 className="mt-2 text-xl font-black">
            {alert.title}
          </h3>
        </div>

        <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-bold uppercase">
          {alert.severity}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-gray-300">
        {alert.description}
      </p>
    </Link>
  );
}
