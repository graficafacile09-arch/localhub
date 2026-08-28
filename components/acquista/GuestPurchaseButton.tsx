"use client";

export default function GuestPurchaseButton() {
  return (
    <form action="/api/auth/guest" method="post">
      <input type="hidden" name="intent" value="activate" />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 sm:w-auto"
      >
        ACQUISTA COME OSPITE
      </button>
    </form>
  );
}
