"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Righe di racconto mostrate prima del taglio, misurate sul testo disposto. */
const RIGHE_MOBILE = 5;
const RIGHE_DESKTOP = 7;
const QUERY_MOBILE = "(max-width: 639px)";

type Segmenter = new (
  locale: string,
  opzioni: { granularity: "sentence" }
) => { segment: (testo: string) => Iterable<{ segment: string }> };

/**
 * Divide il racconto in frasi complete: il taglio può quindi cadere solo dopo
 * un punto, mai a metà frase. Usa Intl.Segmenter quando il browser lo supporta
 * (gestisce anche numeri come 1.955 e abbreviazioni), altrimenti un fallback
 * che spezza solo davanti a una maiuscola.
 */
function dividiInFrasi(testo: string): string[] {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: Segmenter }).Segmenter;
  if (SegmenterCtor) {
    try {
      const segmenter = new SegmenterCtor("it", { granularity: "sentence" });
      const frasi = Array.from(segmenter.segment(testo), (s) => s.segment.trim()).filter(Boolean);
      if (frasi.length > 0) return frasi;
    } catch {
      /* si passa al fallback */
    }
  }

  return testo
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý«"'(])/)
    .map((frase) => frase.trim())
    .filter(Boolean);
}

/**
 * Racconto del territorio.
 *
 * Il testo viene mostrato fino a circa cinque righe su mobile e sette su
 * desktop (righe misurate sul testo realmente disposto) chiudendo sempre
 * sull'ultima frase completa che ci sta, con un pulsante per leggere tutto.
 * La variante "scura" è pensata per il testo sovrapposto alla fotografia:
 * usa il sans del sito (mai il serif, caricato solo in corsivo) perché resti
 * leggibile sopra l'immagine.
 */
export default function RaccontoTerritorio({
  paragrafi,
  variante = "chiara",
}: {
  paragrafi: string[];
  variante?: "chiara" | "scura";
}) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [espanso, setEspanso] = useState(false);
  /** Numero di frasi visibili a testo chiuso; null = ancora da misurare. */
  const [limite, setLimite] = useState<number | null>(null);
  /** Resta true se il racconto supera le righe concesse: il pulsante così non
   *  sparisce quando si rimisura a testo già aperto. */
  const [testoTagliato, setTestoTagliato] = useState(false);
  /** Cambia a ogni resize: forza una nuova misura del punto di taglio. */
  const [richiestaMisura, setRichiestaMisura] = useState(0);

  const frasi = useMemo(() => paragrafi.map(dividiInFrasi), [paragrafi]);
  const totale = useMemo(() => frasi.reduce((n, paragrafo) => n + paragrafo.length, 0), [frasi]);

  // Il numero di righe concesse dipende dal breakpoint sm.
  useEffect(() => {
    const query = window.matchMedia(QUERY_MOBILE);
    const aggiorna = () => {
      setMobile(query.matches);
      setEspanso(false);
      setLimite(null);
      setTestoTagliato(false);
      setRichiestaMisura((valore) => valore + 1);
    };
    aggiorna();
    query.addEventListener("change", aggiorna);
    return () => query.removeEventListener("change", aggiorna);
  }, []);

  // Misura le righe vere e tiene solo le frasi che stanno nel limite.
  // Misura sempre quando cambiano breakpoint/testo/resize: nessuna misura
  // "vecchia" può sopravvivere a un cambio di larghezza.
  useEffect(() => {
    if (espanso) return;

    const id = window.requestAnimationFrame(() => {
      const el = contenitore.current;
      const primo = el?.querySelector<HTMLElement>("[data-paragrafo]");
      if (!el || !primo) return;

      const stile = window.getComputedStyle(primo);
      const interlinea = parseFloat(stile.lineHeight) || parseFloat(stile.fontSize) * 1.75;
      const righe = mobile ? RIGHE_MOBILE : RIGHE_DESKTOP;
      const tetto = primo.getBoundingClientRect().top + interlinea * righe + 1;

      let visibili = 0;
      for (const frase of Array.from(el.querySelectorAll<HTMLElement>("[data-frase]"))) {
        const rect = frase.getBoundingClientRect();
        // Le frasi già nascoste (display: none) hanno rettangolo 0×0: non si
        // misurano e non devono fermare il conteggio di quelle visibili.
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.bottom <= tetto) visibili += 1;
        else break;
      }

      setLimite(Math.max(1, visibili));
      setTestoTagliato(visibili < totale);
    });

    return () => window.cancelAnimationFrame(id);
  }, [mobile, espanso, totale, richiestaMisura]);

  // Cambio di larghezza (rotazione, tastiera, barra indirizzi): si rimisura il
  // taglio, senza perdere il pulsante quando il testo è già aperto.
  useEffect(() => {
    const ridimensiona = () => setRichiestaMisura((valore) => valore + 1);
    window.addEventListener("resize", ridimensiona);
    return () => window.removeEventListener("resize", ridimensiona);
  }, []);

  const daMostrare = !espanso && limite !== null ? limite : Number.POSITIVE_INFINITY;

  // Posizione della prima frase di ogni paragrafo: calcolata prima del render
  // (non con un contatore riassegnato dentro il map, che il lint rifiuta).
  const inizioParagrafo = frasi.reduce<number[]>((offset, paragrafo, p) => {
    offset.push(p === 0 ? 0 : offset[p - 1] + frasi[p - 1].length);
    return offset;
  }, []);

  const corpo = frasi.map((paragrafo, p) => {
    const inizio = inizioParagrafo[p] ?? 0;

    return (
      <p
        key={`paragrafo-${p}`}
        data-paragrafo
        className={inizio < daMostrare ? undefined : "hidden"}
      >
        {paragrafo.map((frase, f) => (
          <span
            key={`frase-${p}-${f}`}
            data-frase
            className={inizio + f < daMostrare ? undefined : "hidden"}
          >
            {frase}
            {f < paragrafo.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    );
  });

  return (
    <div>
      <div
        ref={contenitore}
        data-racconto
        className={
          variante === "scura"
            ? "mt-4 space-y-3 text-[15px] font-medium not-italic leading-7 text-white md:text-base md:leading-8"
            : "mt-3 space-y-4 text-sm leading-7 text-slate-700 md:text-[15px]"
        }
      >
        {corpo}
      </div>

      {testoTagliato && (
        <button
          type="button"
          onClick={() => setEspanso((valore) => !valore)}
          aria-expanded={espanso}
          className={
            variante === "scura"
              ? // Sopra la fotografia il pulsante è secondario (l'azione
                // principale resta la CTA gialla della scheda): vetro chiaro,
                // niente blu di riempimento fuori palette.
                "mt-4 inline-flex items-center justify-center rounded-lg border border-white/45 bg-white/10 px-4 py-2 text-xs font-bold text-white shadow-sm backdrop-blur-sm transition hover:border-white/70 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              : "mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
          }
        >
          {espanso ? "Mostra meno" : "Mostra tutto il testo"}
        </button>
      )}
    </div>
  );
}
