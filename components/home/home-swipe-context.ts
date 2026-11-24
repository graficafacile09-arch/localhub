"use client";

import { createContext, useContext } from "react";

/** Stato condiviso tra la HERO e il comando "Scopri la filiera". */
export type HomeSwipe = {
  /** true quando è aperto il pannello con le filiere/prodotti. */
  showProducts: boolean;
  /** Apre il pannello, come lo swipe verso sinistra. */
  apriProdotti: () => void;
};

export const HomeSwipeContext = createContext<HomeSwipe | null>(null);

export function useHomeSwipe() {
  return useContext(HomeSwipeContext);
}
