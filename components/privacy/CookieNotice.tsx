"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

const COOKIE_NAME = "incitta_cookie_notice_v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function hasNoticeCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${COOKIE_NAME}=1`));
}

function saveNoticeCookie(): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=1; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasNoticeCookie());
  }, []);

  if (!visible) return null;

  return (
    <aside
      role="status"
      aria-label="Informativa sui cookie"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white/95 px-3.5 py-3 shadow-xl shadow-slate-900/10 backdrop-blur sm:px-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
        >
          <Cookie className="h-4.5 w-4.5" />
        </span>

        <p className="min-w-0 flex-1 text-[11px] leading-4 text-slate-600 sm:text-xs sm:leading-5">
          InCittà utilizza cookie tecnici necessari al funzionamento del sito.
          <Link
            href="/cookie"
            className="ml-1 font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            Cookie Policy
          </Link>
        </p>

        <button
          type="button"
          onClick={() => {
            saveNoticeCookie();
            setVisible(false);
          }}
          className="shrink-0 rounded-xl bg-yellow-400 px-3.5 py-2 text-xs font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 active:scale-95 sm:px-4"
        >
          Va bene
        </button>
      </div>
    </aside>
  );
}
