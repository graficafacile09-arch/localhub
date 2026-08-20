"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Store,
  ShoppingCart,
  Package,
  Megaphone,
  Settings2,
  ChevronDown,
  Info,
  Building2,
  Image as ImageIcon,
  Phone,
  MapPin,
  Clock,
  MessageCircle,
  Search,
  Bot,
  Settings,
  Sparkles,
  Tag,
  Calendar,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getModuleComponent } from "@/lib/modules/registry";
import type { ModuloRegistro } from "@/types/negozio";
import { DAYS } from "@/types/negozio";
import SpedizionePaccoConfig from "@/components/merchant/SpedizionePaccoConfig";
import ModalitaVenditaConfig from "@/components/merchant/modules/ModalitaVenditaConfig";
import MetodiPagamentoCard from "@/components/merchant/MetodiPagamentoCard";
import type { ConfigPaccoSpedizione } from "@/lib/merchant/types";

type ComponenteModulo = React.ComponentType<{ storeId: string }> | null;

/** Elenco dei moduli CMS e del loro ordine (fonte condivisa con il wizard). */
const MODULI_REGISTRO: ModuloRegistro[] = [
  { id: "1", slug: "informazioni", nome: "Informazioni", descrizione: "Nome, categoria e descrizione", icona: "Building2", ordinamento: 1, attivo: true, default_in_template: true },
  { id: "2", slug: "immagini", nome: "Immagini", descrizione: "Logo, copertina e galleria", icona: "Image", ordinamento: 2, attivo: true, default_in_template: true },
  { id: "3", slug: "prodotti", nome: "Prodotti", descrizione: "Catalogo prodotti", icona: "Package", ordinamento: 3, attivo: true, default_in_template: true },
  { id: "4", slug: "servizi", nome: "Servizi", descrizione: "Servizi offerti", icona: "Sparkles", ordinamento: 4, attivo: true, default_in_template: true },
  { id: "5", slug: "offerte", nome: "Offerte", descrizione: "Offerte e promozioni", icona: "Tag", ordinamento: 5, attivo: true, default_in_template: true },
  { id: "6", slug: "eventi", nome: "Eventi", descrizione: "Eventi in programma", icona: "Calendar", ordinamento: 6, attivo: true, default_in_template: true },
  { id: "7", slug: "contatti", nome: "Contatti", descrizione: "Telefono, email, WhatsApp", icona: "Phone", ordinamento: 7, attivo: true, default_in_template: true },
  { id: "8", slug: "posizione", nome: "Posizione", descrizione: "Indirizzo e mappa", icona: "MapPin", ordinamento: 8, attivo: true, default_in_template: true },
  { id: "9", slug: "orari", nome: "Orari", descrizione: "Orari di apertura", icona: "Clock", ordinamento: 9, attivo: true, default_in_template: true },
  { id: "10", slug: "social", nome: "Social", descrizione: "Link social", icona: "MessageCircle", ordinamento: 10, attivo: true, default_in_template: true },
  { id: "11", slug: "seo", nome: "SEO", descrizione: "Meta tag e keywords", icona: "Search", ordinamento: 11, attivo: true, default_in_template: true },
  { id: "12", slug: "ai", nome: "AI", descrizione: "Dati assistente AI", icona: "Bot", ordinamento: 12, attivo: true, default_in_template: true },
  { id: "13", slug: "impostazioni", nome: "Impostazioni", descrizione: "Visibilità e preferenze", icona: "Settings", ordinamento: 13, attivo: true, default_in_template: true },
];

/** Moduli che non fanno parte del CMS ma sono sempre disponibili in Vendita. */
const MODULI_SPECIALI = new Set(["modalita-vendita", "spedizione", "pagamenti"]);

/** Fallback se il negozio non ha ancora `moduli_attivi` salvati. */
const MODULI_DEFAULT = [
  "informazioni", "immagini", "prodotti", "servizi", "offerte", "eventi",
  "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni",
];

type ModuloUx = {
  titolo: string;
  descrizione: string;
  azione: string;
  icona: LucideIcon;
};

/** Come il commerciante "pensa" a ogni modulo: titolo, spiegazione e pulsante espliciti. */
const MODULI_UX: Record<string, ModuloUx> = {
  informazioni: { titolo: "Informazioni", descrizione: "Nome, categoria e descrizione del negozio", azione: "Modifica informazioni", icona: Building2 },
  immagini: { titolo: "Foto", descrizione: "Logo, copertina e galleria", azione: "Gestisci foto", icona: ImageIcon },
  contatti: { titolo: "Contatti", descrizione: "Telefono, email e WhatsApp", azione: "Modifica contatti", icona: Phone },
  posizione: { titolo: "Posizione", descrizione: "Indirizzo e mappa", azione: "Modifica posizione", icona: MapPin },
  orari: { titolo: "Orari", descrizione: "Quando sei aperto", azione: "Modifica orari", icona: Clock },
  social: { titolo: "Social", descrizione: "I tuoi profili social", azione: "Gestisci social", icona: MessageCircle },
  seo: { titolo: "Visibilità su Google", descrizione: "Come il tuo negozio viene trovato su Google", azione: "Migliora su Google", icona: Search },
  ai: { titolo: "Assistente AI", descrizione: "Strumenti intelligenti per il tuo negozio", azione: "Configura assistente", icona: Bot },
  impostazioni: { titolo: "Preferenze", descrizione: "Visibilità, colori e parole chiave", azione: "Modifica preferenze", icona: Settings },
  servizi: { titolo: "Servizi", descrizione: "Servizi offerti (es. Wi-Fi, parcheggio)", azione: "Gestisci servizi", icona: Sparkles },
  prodotti: { titolo: "Prodotti", descrizione: "Catalogo, aggiunta e scansione AI", azione: "Gestisci catalogo", icona: Package },
  offerte: { titolo: "Offerte", descrizione: "Promozioni e sconti", azione: "Gestisci offerte", icona: Tag },
  eventi: { titolo: "Eventi", descrizione: "Eventi in programma", azione: "Gestisci eventi", icona: Calendar },
  "modalita-vendita": { titolo: "Come vendi", descrizione: "Ritiro in negozio, consegna o spedizione", azione: "Modifica modalità di vendita", icona: Store },
  spedizione: { titolo: "Spedizione", descrizione: "Pacco, corrieri e costi", azione: "Configura spedizione", icona: Truck },
};

type Sezione = {
  id: string;
  icona: LucideIcon;
  titolo: string;
  descrizione: string;
  riepilogo: string;
  moduli: string[];
  /** primaria = sezione principale · secondaria = opzioni meno frequenti. */
  peso?: "primaria" | "secondaria";
};

const SEZIONI: Sezione[] = [
  {
    id: "negozio",
    icona: Store,
    titolo: "Il mio negozio",
    descrizione: "Tieni aggiornate le informazioni che i clienti vedono sul tuo negozio.",
    riepilogo: "Informazioni · Foto · Contatti · Posizione · Orari",
    moduli: ["informazioni", "immagini", "contatti", "posizione", "orari"],
    peso: "primaria",
  },
  {
    id: "vendita",
    icona: ShoppingCart,
    titolo: "Vendita",
    descrizione: "Come i clienti ti comprano e come ricevono i prodotti.",
    riepilogo: "Modalità di vendita · Spedizione · Metodi di pagamento",
    moduli: ["modalita-vendita", "spedizione", "pagamenti"],
  },
  {
    id: "catalogo",
    icona: Package,
    titolo: "Catalogo e offerte",
    descrizione: "Prodotti, servizi e promozioni del negozio.",
    riepilogo: "Prodotti · Servizi · Offerte · Eventi",
    moduli: ["prodotti", "servizi", "offerte", "eventi"],
  },
  {
    id: "visibilita",
    icona: Megaphone,
    titolo: "Visibilità e promozione",
    descrizione: "Fatti trovare su Google, sui social e con l'assistente AI.",
    riepilogo: "Social · Google · Assistente AI",
    moduli: ["social", "seo", "ai"],
  },
  {
    id: "avanzate",
    icona: Settings2,
    titolo: "Impostazioni avanzate",
    descrizione: "Opzioni meno frequenti: visibilità, in evidenza, colori e parole chiave.",
    riepilogo: "Visibilità · In evidenza · Colori · Parole chiave",
    moduli: ["impostazioni"],
    peso: "secondaria",
  },
];

type Riepilogo = { testo: string; vuoto?: boolean };

/** Genera il riepilogo dello stato attuale di un modulo dai dati già caricati. */
function generaRiepilogo(
  slug: string,
  s: Record<string, unknown> | null,
  configPacco: ConfigPaccoSpedizione,
  conteggi: Record<string, number>
): Riepilogo {
  const orari = (s?.orari as Record<string, { chiuso?: boolean; apertura1?: string; chiusura1?: string; apertura2?: string; chiusura2?: string }> | null) ?? null;
  switch (slug) {
    case "informazioni": {
      const nome = (s?.nome as string) ?? "";
      if (!nome) return { testo: "Non ancora configurato", vuoto: true };
      const parti = [nome, s?.categoria as string, s?.citta as string].filter(Boolean);
      return { testo: parti.join(" · ") };
    }
    case "immagini": {
      const count = ((s?.logo_url ? 1 : 0) + (s?.copertina_url ? 1 : 0) + ((s?.galleria as string[] | null)?.length ?? 0));
      if (count === 0) return { testo: "Non ancora configurato", vuoto: true };
      return { testo: count === 1 ? "1 foto" : `${count} foto` };
    }
    case "contatti": {
      const valori = [s?.telefono, s?.email_negozio, s?.whatsapp].filter((v): v is string => Boolean(v));
      if (valori.length === 0) return { testo: "Non ancora configurato", vuoto: true };
      return { testo: valori.join(" · ") };
    }
    case "posizione": {
      const indirizzo = s?.indirizzo as string | undefined;
      const citta = s?.citta as string | undefined;
      if (!indirizzo && !citta) return { testo: "Non ancora configurato", vuoto: true };
      return { testo: [indirizzo, citta].filter(Boolean).join(", ") };
    }
    case "orari": {
      if (!orari) return { testo: "Non ancora configurato", vuoto: true };
      const oggi = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
      const day = orari[oggi];
      if (day?.apertura1) {
        const prima = `${day.apertura1}–${day.chiusura1}`;
        const seconda = day.apertura2 ? ` / ${day.apertura2}–${day.chiusura2}` : "";
        return { testo: `Oggi: ${prima}${seconda}` };
      }
      if (day?.chiuso) return { testo: "Oggi chiuso" };
      if (Object.keys(orari).length > 0) return { testo: "Orari configurati" };
      return { testo: "Non ancora configurato", vuoto: true };
    }
    case "social": {
      const profili = ["facebook", "instagram", "tiktok", "youtube"].filter((k) => Boolean((s as Record<string, unknown> | null)?.[k]));
      if (profili.length === 0) return { testo: "Nessun profilo collegato", vuoto: true };
      return { testo: profili.join(" · ") };
    }
    case "seo": {
      const title = (s?.seo_title as string) ?? "";
      if (!title) return { testo: "Non ancora configurato", vuoto: true };
      return { testo: title };
    }
    case "ai": {
      const ai = ((s?.data as Record<string, unknown> | null)?.ai_data as Record<string, unknown> | null) ?? null;
      const configurato = Boolean(ai && (ai.istruzioni || ai.tono || (Array.isArray(ai.domande_frequenti) && ai.domande_frequenti.length > 0)));
      return configurato ? { testo: "Assistente configurato" } : { testo: "Non ancora configurato", vuoto: true };
    }
    case "impostazioni": {
      const attivo = s?.attivo !== false;
      return attivo ? { testo: "Visibile nelle ricerche" } : { testo: "Non visibile nelle ricerche", vuoto: true };
    }
    case "servizi": {
      const servizi = (s?.servizi as string[] | null) ?? [];
      if (servizi.length === 0) return { testo: "Nessun servizio", vuoto: true };
      return { testo: servizi.slice(0, 3).join(" · ") + (servizi.length > 3 ? ` +${servizi.length - 3}` : "") };
    }
    case "prodotti":
      return { testo: "Catalogo e aggiunta prodotti" };
    case "offerte": {
      const n = conteggi.offerte;
      if (n === undefined) return { testo: "Non ancora configurato", vuoto: true };
      return n === 0 ? { testo: "Nessuna offerta", vuoto: true } : { testo: `${n} ${n === 1 ? "offerta" : "offerte"}` };
    }
    case "eventi": {
      const n = conteggi.eventi;
      if (n === undefined) return { testo: "Non ancora configurato", vuoto: true };
      return n === 0 ? { testo: "Nessun evento", vuoto: true } : { testo: `${n} ${n === 1 ? "evento" : "eventi"}` };
    }
    case "modalita-vendita": {
      const mv = (s?.data as Record<string, unknown> | null)?.modalita_vendita as Record<string, unknown> | null ?? null;
      const attive = ["ritiro", "consegna", "spedizione"].filter((k) => mv?.[k] !== false);
      if (attive.length === 0) return { testo: "Non ancora configurata", vuoto: true };
      const label: Record<string, string> = { ritiro: "Ritiro in negozio", consegna: "Consegna a domicilio", spedizione: "Spedizione" };
      return { testo: attive.map((k) => label[k]).join(" · ") };
    }
    case "spedizione": {
      const parti: string[] = [];
      if (configPacco.paccoPesoGrammi) parti.push(`${(configPacco.paccoPesoGrammi / 1000).toLocaleString("it-IT")} kg`);
      const dims = [configPacco.paccoLunghezzaCm, configPacco.paccoLarghezzaCm, configPacco.paccoAltezzaCm]
        .filter((v): v is number => typeof v === "number" && v > 0);
      if (dims.length > 0) parti.push(`${dims.join("×")} cm`);
      if (parti.length === 0) return { testo: "Non ancora configurato", vuoto: true };
      return { testo: `Pacco: ${parti.join(" · ")}` };
    }
    default:
      return { testo: "" };
  }
}

/**
 * Pagina /impostazioni — 5 sezioni accordion (una sola aperta alla volta).
 * Dentro ogni sezione: card-modulo con riepilogo dello stato attuale; il
 * click espande il modulo (i form restano montati dopo la prima apertura,
 * quindi i dati non vengono mai persi).
 */
export default function SettingsSections({
  storeId,
  configPacco,
}: {
  storeId: string;
  configPacco: ConfigPaccoSpedizione;
}) {
  const [loading, setLoading] = useState(true);
  const [componenti, setComponenti] = useState<Record<string, ComponenteModulo>>({});
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [moduliAttivi, setModuliAttivi] = useState<string[] | null>(null);
  const [conteggi, setConteggi] = useState<Record<string, number>>({});
  const [aperta, setAperta] = useState<string>("negozio");
  const [aperteOnce, setAperteOnce] = useState<Record<string, boolean>>({ negozio: true });
  const [moduloAperto, setModuloAperto] = useState<Record<string, string>>({});
  const [moduliOnce, setModuliOnce] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let attivo = true;
    async function load() {
      let attivi: string[] | null = null;
      let settingsData: Record<string, unknown> | null = null;
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/settings`);
        const json = await res.json();
        if (json.success) {
          settingsData = json.data.settings as Record<string, unknown>;
          attivi = (settingsData.moduli_attivi as string[] | undefined) ?? MODULI_DEFAULT;
        }
      } catch {
        // nessun settings disponibile: si usa il fallback
      }
      if (attivo) setSettings(settingsData);
      if (attivo) setModuliAttivi(attivi ?? MODULI_DEFAULT);

      const slugs = SEZIONI.flatMap((s) => s.moduli).filter(
        (slug) => !MODULI_SPECIALI.has(slug)
      );
      const mappa: Record<string, ComponenteModulo> = {};
      for (const slug of slugs) {
        mappa[slug] = await getModuleComponent(slug);
      }
      if (attivo) setComponenti(mappa);
      if (attivo) setLoading(false);

      // Conteggi per i riepiloghi di offerte/eventi (endpoint già esistenti).
      const daContare = (attivi ?? MODULI_DEFAULT).filter((x) => x === "offerte" || x === "eventi");
      for (const tipo of daContare) {
        try {
          const r = await fetch(`/api/merchant/stores/${storeId}/${tipo}`);
          const j = await r.json();
          const lista = (j.data?.[tipo] as unknown[] | null) ?? [];
          if (attivo) setConteggi((c) => ({ ...c, [tipo]: lista.length }));
        } catch {
          // nessun conteggio: il riepilogo resta "Non ancora configurato"
        }
      }
    }
    void load();
    return () => {
      attivo = false;
    };
  }, [storeId]);

  const sezioniVisibili = useMemo(() => {
    const attivi = moduliAttivi ?? MODULI_DEFAULT;
    return SEZIONI.map((s) => ({
      ...s,
      moduli: s.moduli.filter((slug) => MODULI_SPECIALI.has(slug) || attivi.includes(slug)),
    })).filter((s) => s.moduli.length > 0);
  }, [moduliAttivi]);

  const sezioneAperta = sezioniVisibili.some((s) => s.id === aperta)
    ? aperta
    : (sezioniVisibili[0]?.id ?? null);

  function toggleModulo(sezioneId: string, slug: string) {
    setModuloAperto((m) => ({ ...m, [sezioneId]: m[sezioneId] === slug ? "" : slug }));
    setModuliOnce((o) => ({ ...o, [sezioneId]: o[sezioneId]?.includes(slug) ? o[sezioneId] : [...(o[sezioneId] ?? []), slug] }));
  }

  /** Apre una sezione e, se indicato, espande anche il modulo (usato dalle azioni rapide). */
  function apriSezione(sezioneId: string, slug?: string) {
    setAperta(sezioneId);
    setAperteOnce((o) => ({ ...o, [sezioneId]: true }));
    if (slug) toggleModulo(sezioneId, slug);
    else setModuloAperto((m) => ({ ...m, [sezioneId]: "" }));
  }

  /** Elementi essenziali già configurati (per lo stato della vetrina). */
  const mancanti = useMemo(() => {
    const s = settings;
    const lista: string[] = [];
    if (!s?.nome) lista.push("Nome negozio");
    if (!s?.logo_url && !s?.copertina_url && !((s?.galleria as string[] | null)?.length)) lista.push("Foto");
    if (!s?.telefono && !s?.email_negozio && !s?.whatsapp) lista.push("Contatti");
    if (!s?.indirizzo && !s?.citta) lista.push("Indirizzo");
    if (!(s?.orari as Record<string, unknown> | null)) lista.push("Orari");
    return lista;
  }, [settings]);

  const azioniPrincipali = useMemo(() => {
    const visibili = new Set(sezioniVisibili.flatMap((x) => x.moduli));
    const azioni: { label: string; descrizione: string; sezione: string; slug?: string; icona: LucideIcon }[] = [
      { label: "Modifica informazioni", descrizione: "Nome, categoria e descrizione", sezione: "negozio", slug: "informazioni", icona: Building2 },
      { label: "Foto del negozio", descrizione: "Logo, copertina e galleria", sezione: "negozio", slug: "immagini", icona: ImageIcon },
      { label: "Gestisci prodotti", descrizione: "Catalogo e aggiunta prodotti", sezione: "catalogo", slug: "prodotti", icona: Package },
      { label: "Come vendi", descrizione: "Ritiro, consegna o spedizione", sezione: "vendita", slug: "modalita-vendita", icona: ShoppingCart },
    ];
    return azioni.filter((a) => a.sezione && visibili.has(a.slug ?? ""));
  }, [sezioniVisibili]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Caricamento moduli...</p>
      </div>
    );
  }

  const logoUrl = (settings?.logo_url as string | undefined) ?? (settings?.copertina_url as string | undefined) ?? null;
  const nome = (settings?.nome as string | undefined) ?? "Il tuo negozio";
  const categoria = (settings?.categoria as string | undefined) ?? "";
  const citta = (settings?.citta as string | undefined) ?? "";
  const configurato = mancanti.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Il tuo negozio — card principale (la vetrina) ─────────────────── */}
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 sm:h-24 sm:w-24">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={nome} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-9 w-9 sm:h-10 sm:w-10" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Il tuo negozio
              </p>
              <h2 className="mt-1 break-words text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                {nome}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {[categoria, citta].filter(Boolean).join(" · ") || "La tua vetrina su InCittà"}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:ml-auto sm:items-end">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                configurato ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${configurato ? "bg-emerald-500" : "bg-amber-500"}`} />
              {configurato
                ? "Negozio configurato"
                : `Completa: ${mancanti.slice(0, 2).join(", ")}${mancanti.length > 2 ? ` +${mancanti.length - 2}` : ""}`}
            </span>
            <button
              type="button"
              onClick={() => apriSezione("negozio", "informazioni")}
              className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              <Building2 className="h-4 w-4" aria-hidden />
              Modifica negozio
            </button>
          </div>
        </div>
      </div>

      {/* ── Azioni principali ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {azioniPrincipali.map((a) => {
          const Icona = a.icona;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => apriSezione(a.sezione, a.slug)}
              className="group flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                <Icona className="h-5 w-5" aria-hidden />
              </span>
              <span className="block text-sm font-bold leading-tight text-slate-900">{a.label}</span>
              <span className="block text-[11px] leading-4 text-slate-500">{a.descrizione}</span>
            </button>
          );
        })}
      </div>

      {sezioniVisibili.map((s) => {
        const Icona = s.icona;
        const isAperta = sezioneAperta === s.id;
        const resa = isAperta || aperteOnce[s.id] === true;
        const primaria = s.peso === "primaria";
        const secondaria = s.peso === "secondaria";
        const aperto = moduloAperto[s.id] ?? "";

        return (
          <div
            key={s.id}
            className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm ${
              primaria ? "border-blue-200" : secondaria ? "border-slate-200" : "border-slate-200"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setAperta((prev) => (prev === s.id ? "" : s.id));
                setAperteOnce((o) => ({ ...o, [s.id]: true }));
              }}
              aria-expanded={isAperta}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50/70 sm:gap-4 sm:px-5"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
                  primaria && isAperta
                    ? "bg-yellow-400 text-blue-900"
                    : primaria
                      ? "bg-yellow-100 text-blue-800"
                      : isAperta
                        ? "bg-blue-600 text-white"
                        : secondaria
                          ? "bg-slate-100 text-slate-500"
                          : "bg-blue-50 text-blue-700"
                }`}
              >
                <Icona className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black tracking-tight text-slate-900">
                  {s.titolo}
                  {primaria && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Inizia da qui
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                  {isAperta ? s.descrizione : s.riepilogo}
                </span>
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isAperta ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>

            <div className={isAperta ? "" : "hidden"}>
              {resa && (
                <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
                  {s.moduli.map((slug) => {
                    if (slug === "pagamenti") {
                      return <MetodiPagamentoCard key="pagamenti" storeId={storeId} />;
                    }
                    const ux = MODULI_UX[slug];
                    const Componente = componenti[slug];
                    const nome = MODULI_REGISTRO.find((m) => m.slug === slug)?.nome ?? slug;
                    const riepilogo = generaRiepilogo(slug, settings, configPacco, conteggi);
                    const isModuloAperto = aperto === slug;
                    const montato = (moduliOnce[s.id] ?? []).includes(slug);

                    return (
                      <div
                        key={slug}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleModulo(s.id, slug)}
                          aria-expanded={isModuloAperto}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/70"
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                              isModuloAperto ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            <ux.icona className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold tracking-tight text-slate-900">
                              {ux.titolo}
                            </span>
                            <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                              {ux.descrizione}
                            </span>
                            {riepilogo.testo && (
                              <span
                                className={`mt-1 block truncate text-xs font-semibold ${
                                  riepilogo.vuoto ? "text-amber-600" : "text-blue-700"
                                }`}
                              >
                                {riepilogo.testo}
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                              isModuloAperto
                                ? "bg-blue-600 text-white"
                                : "bg-blue-50 text-blue-700 group-hover:bg-blue-100"
                            }`}
                          >
                            {isModuloAperto ? "Chiudi" : `${ux.azione} ›`}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                              isModuloAperto ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          />
                        </button>

                        <div className={isModuloAperto ? "" : "hidden"}>
                          {montato && (
                            <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                              {slug === "spedizione" ? (
                                <SpedizionePaccoConfig
                                  negozioId={storeId}
                                  initialConfig={configPacco}
                                />
                              ) : slug === "modalita-vendita" ? (
                                <ModalitaVenditaConfig storeId={storeId} />
                              ) : Componente ? (
                                <Componente storeId={storeId} />
                              ) : (
                                <p className="text-sm text-slate-400">
                                  Modulo &ldquo;{nome}&rdquo; non disponibile
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p>
          Ogni scheda si salva con il proprio pulsante &ldquo;Salva modifiche&rdquo;.
          Apri una scheda alla volta per non perdere il filo.
        </p>
      </div>
    </div>
  );
}
