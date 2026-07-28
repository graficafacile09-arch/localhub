import Link from "next/link";

export function DeliveryOptionCard({
  icon,
  title,
  description,
  actionLabel,
  href,
}: {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          <span className="mt-2 inline-block text-xs font-semibold text-blue-600">
            {actionLabel} →
          </span>
        </div>
      </div>
    </Link>
  );
}
