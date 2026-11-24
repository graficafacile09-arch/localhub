"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_LINGUA,
  LINGUE_TRADOTTE,
  registraDizionario,
  type Lingua,
  type LinguaTradotta,
} from "@/lib/i18n/dictionary";
import {
  allineaLinguaOsservata,
  osserva,
  ripristina,
  traduciAlbero,
} from "@/lib/i18n/traduzione-dom";

/**
 * Carica il dizionario della lingua scelta. L'inglese è già nel bundle; i
 * dizionari francese, spagnolo e tedesco arrivano solo quando servono, per non
 * appesantire le pagine di chi resta in italiano.
 */
async function caricaDizionario(lingua: LinguaTradotta): Promise<void> {
  if (lingua === "en") return;
  if (lingua === "fr") {
    const modulo = await import("@/lib/i18n/dictionary-fr");
    registraDizionario("fr", modulo.DIZIONARIO_FR);
    return;
  }
  if (lingua === "de") {
    const modulo = await import("@/lib/i18n/dictionary-de");
    registraDizionario("de", modulo.DIZIONARIO_DE);
    return;
  }
  const modulo = await import("@/lib/i18n/dictionary-es");
  registraDizionario("es", modulo.DIZIONARIO_ES);
}

type ValoreLingua = {
  lingua: Lingua;
  /** Imposta la lingua scelta dal selettore (italiano compreso). */
  cambiaLingua: (nuova: Lingua) => void;
};

const ContestoLingua = createContext<ValoreLingua>({
  lingua: "it",
  cambiaLingua: () => {},
});

/** Lingua corrente (per il selettore) e funzione che la cambia. */
export function useLingua(): ValoreLingua {
  return useContext(ContestoLingua);
}

const LINGUE_VALIDE: Lingua[] = ["it", ...LINGUE_TRADOTTE];

function valida(valore: string | null | undefined): Lingua | null {
  return valore && (LINGUE_VALIDE as string[]).includes(valore) ? (valore as Lingua) : null;
}

/**
 * Legge la lingua salvata. Il cookie è la fonte principale; `localStorage`
 * copre i browser che bloccano o cancellano i cookie (es. navigazione privata
 * o protezioni anti-tracking), così la scelta non si perde al refresh.
 */
function leggiLingua(): Lingua {
  if (typeof document === "undefined") return "it";

  const trovato = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_LINGUA}=([^;]+)`));
  const daCookie = valida(trovato?.[1]);
  if (daCookie) return daCookie;

  try {
    const daStorage = valida(window.localStorage.getItem(COOKIE_LINGUA));
    if (daStorage) {
      // Ricrea il cookie mancante, così resta valido anche per le prossime visite.
      scriviLingua(daStorage);
      return daStorage;
    }
  } catch {
    // localStorage non disponibile: si resta in italiano.
  }
  return "it";
}

function scriviLingua(lingua: Lingua): void {
  document.cookie = `${COOKIE_LINGUA}=${lingua}; path=/; max-age=31536000; samesite=lax`;
  try {
    window.localStorage.setItem(COOKIE_LINGUA, lingua);
  } catch {
    // Senza localStorage vale comunque il cookie.
  }
}

/**
 * Aspetta che il browser resti libero per qualche giro consecutivo (indizio che
 * React ha finito di idratare), ma con un tetto massimo: su dispositivi lenti
 * il thread può non essere mai libero, e la traduzione non deve restare
 * bloccata in attesa. Restituisce la funzione per annullare l'attesa.
 */
function quandoLibero(azione: () => void, tettoMs: number): () => void {
  let fatto = false;
  const stato: { tetto?: number } = {};

  const fai = () => {
    if (fatto) return;
    fatto = true;
    if (stato.tetto !== undefined) window.clearTimeout(stato.tetto);
    azione();
  };

  let liberi = 0;
  const giro = () => {
    if (fatto) return;
    const inizio = performance.now();
    window.setTimeout(() => {
      if (fatto) return;
      const occupato = performance.now() - inizio > 170;
      liberi = occupato ? 0 : liberi + 1;
      if (liberi >= 3) fai();
      else giro();
    }, 100);
  };

  stato.tetto = window.setTimeout(fai, tettoMs);
  giro();

  return () => {
    fatto = true;
    if (stato.tetto !== undefined) window.clearTimeout(stato.tetto);
  };
}

/**
 * Avvolge il sito e applica la lingua scelta (italiano, inglese, francese,
 * spagnolo o tedesco). Il primo render è sempre in italiano (così l'HTML del server e il
 * client coincidono); subito dopo, se il cookie indica un'altra lingua, i testi
 * vengono tradotti dal dizionario.
 *
 * La prima passata non aspetta più l'evento `load` (che su pagine con molte
 * immagini arriva dopo secondi, lasciando il sito in italiano): parte appena
 * il browser è libero, al massimo entro poco più di un secondo, e comunque al
 * primo tocco dell'utente. L'observer resta poi acceso sulle sezioni aperte
 * dopo, e ogni cambio di percorso forza una nuova passata.
 */
export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lingua, setLingua] = useState<Lingua>("it");
  const percorso = usePathname();
  const percorsoPrecedente = useRef(percorso);
  /** True quando la lingua è stata cambiata da un tocco sul selettore. */
  const daTocco = useRef(false);

  useEffect(() => {
    const iniziale = leggiLingua();
    if (iniziale === "it") return undefined;
    // Fuori dal corpo dell'effetto: il primo render resta identico al server
    // (italiano) e la lingua salvata si applica subito dopo l'idratazione.
    const id = window.setTimeout(() => setLingua(iniziale), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lingua;

    if (lingua === "it") {
      osserva(false, lingua);
      ripristina();
      return undefined;
    }

    const immediato = daTocco.current;
    daTocco.current = false;

    let annullato = false;
    let avviato = false;
    const passate: number[] = [];
    let annullaAttesa: (() => void) | null = null;

    const traduci = () => {
      if (annullato) return;
      traduciAlbero(document.body, lingua);
    };

    const avvia = () => {
      if (annullato || avviato) return;
      avviato = true;
      annullaAttesa?.();
      annullaAttesa = null;
      traduci();
      // L'observer si accende solo dopo la prima passata: durante
      // l'idratazione React inserisce e riscrive nodi, e tradurli in quel
      // momento produce un mismatch di testo (errore 418).
      osserva(true, lingua);
      const tempi = immediato ? [250, 900] : [400, 1200, 2600, 4200];
      for (const ms of tempi) passate.push(window.setTimeout(traduci, ms));
    };

    // Il dizionario può arrivare dalla rete: si traduce appena è disponibile.
    const preparaEAvvia = () => {
      void caricaDizionario(lingua)
        .catch(() => {})
        .then(() => {
          if (!annullato) avvia();
        });
    };

    // Al primo tocco la pagina è già idratata: non c'è motivo di aspettare.
    const suInterazione = () => preparaEAvvia();

    if (immediato) {
      preparaEAvvia();
    } else {
      annullaAttesa = quandoLibero(preparaEAvvia, 1200);
      window.addEventListener("pointerdown", suInterazione, { once: true, passive: true });
      window.addEventListener("keydown", suInterazione, { once: true });
      window.addEventListener("touchstart", suInterazione, { once: true, passive: true });
    }

    return () => {
      annullato = true;
      annullaAttesa?.();
      passate.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("pointerdown", suInterazione);
      window.removeEventListener("keydown", suInterazione);
      window.removeEventListener("touchstart", suInterazione);
    };
  }, [lingua]);

  // Dopo una navigazione client-side il nuovo contenuto è italiano: qui lo si
  // ritraduce subito e poi ancora mentre arrivano i dati in streaming.
  useEffect(() => {
    const cambiato = percorsoPrecedente.current !== percorso;
    percorsoPrecedente.current = percorso;
    if (!cambiato || lingua === "it") return undefined;

    const passate = [0, 200, 600, 1500, 3000].map((ms) =>
      window.setTimeout(() => traduciAlbero(document.body, lingua), ms),
    );
    return () => passate.forEach((id) => window.clearTimeout(id));
  }, [percorso, lingua]);

  const cambiaLingua = useCallback((nuova: Lingua) => {
    // Si riparte SEMPRE dai testi italiani originali, non da quelli della
    // lingua precedente: passando francese → spagnolo le traduzioni francesi
    // restavano in pagina nei punti non ancora ritradotti (testo misto).
    // Tornare all'italiano è immediato, senza passate di traduzione.
    ripristina();
    allineaLinguaOsservata(nuova);
    daTocco.current = true;
    scriviLingua(nuova);
    setLingua(nuova);
  }, []);

  return (
    <ContestoLingua.Provider value={{ lingua, cambiaLingua }}>{children}</ContestoLingua.Provider>
  );
}
