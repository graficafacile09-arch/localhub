"use client";

import dynamic from "next/dynamic";

const RecessoOrdine = dynamic(() => import("./RecessoOrdine.jsx"), {
  ssr: false,
});

export default function RecessoOrdineGuest({ ordineId, token = null }) {
  return <RecessoOrdine ordineId={ordineId} token={token} />;
}
