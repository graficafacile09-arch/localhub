"use client";

import type { ReactNode } from "react";

type ModuleShellProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  id: string;
  children: ReactNode;
};

export default function ModuleShell({ icon, title, subtitle, id, children }: ModuleShellProps) {
  return (
    <section id={id} className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm scroll-mt-24">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
