"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export default function HomeResetLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="InCittà — Home"
      className={className}
      onClick={() => window.dispatchEvent(new Event("incitta:reset-home"))}
    >
      {children}
    </Link>
  );
}
