import type { ReactNode } from "react";

export default function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-blue-200/70 bg-white shadow-[0_30px_70px_-40px_rgba(37,99,235,0.35)]">
      <div className="h-1 bg-linear-to-r from-blue-300 via-white to-yellow-300" />
      <div className="space-y-6 p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
            Area Venditore
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
