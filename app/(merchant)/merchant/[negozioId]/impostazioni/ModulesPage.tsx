"use client";

import { useState, useEffect } from "react";
import { getModuleComponent } from "@/lib/modules/registry";
import type { ModuloRegistro } from "@/types/negozio";

const ICON_MAP: Record<string, string> = {
  Building2: "🏪", Image: "🖼️", Package: "📦", Sparkles: "✨", Tag: "🏷️",
  Calendar: "📅", Phone: "📞", MapPin: "📍", Clock: "🕐", MessageCircle: "💬",
  Search: "🔍", Bot: "🤖", Settings: "⚙️",
};

type ModuleWithComponent = ModuloRegistro & {
  Component: React.ComponentType<{ storeId: string }> | null;
};

export default function ModulesPage({ storeId }: { storeId: string }) {
  const [moduli, setModuli] = useState<ModuleWithComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/categories");
        const json = await res.json();
      } catch {}

      const res = await fetch(`/api/merchant/stores/${storeId}/settings`);
      const json = await res.json();
      let moduliAttivi: string[] = [];

      if (json.success) {
        moduliAttivi = json.data.settings.moduli_attivi ?? [
          "informazioni", "immagini", "prodotti", "servizi", "offerte", "eventi",
          "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni",
        ];
      }

      const moduliRegistro: ModuloRegistro[] = [
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

      const filtered = moduliRegistro.filter((m) => moduliAttivi.includes(m.slug));
      const withComponents: ModuleWithComponent[] = [];

      for (const m of filtered) {
        const Component = await getModuleComponent(m.slug);
        withComponents.push({ ...m, Component });
      }

      setModuli(withComponents);
      if (withComponents.length > 0) {
        setActiveTab(withComponents[0].slug);
      }
      setLoading(false);
    }
    load();
  }, [storeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Caricamento moduli...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation tabs per modulo */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {moduli.map((m) => (
          <button
            key={m.slug}
            type="button"
            onClick={() => {
              setActiveTab(m.slug);
              document.getElementById(`modulo-${m.slug}`)?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === m.slug
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <span>{ICON_MAP[m.icona] ?? "📋"}</span>
            {m.nome}
          </button>
        ))}
      </div>

      {/* Module sections */}
      <div className="space-y-6">
        {moduli.map((m) => (
          <div key={m.slug} id={`modulo-${m.slug}`}>
            {m.Component ? (
              <m.Component storeId={storeId} />
            ) : (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm text-slate-400">Modulo &ldquo;{m.nome}&rdquo; non disponibile</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
