import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  FolderTree,
  Package,
  Store,
  Users,
} from "lucide-react";
import { getAdminNavItem } from "@/components/amministratore/navigation";
import { getDatiStatistiche } from "@/lib/amministratore/statistiche-queries";

export const metadata = {
  title: "Statistiche — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Statistiche piattaforma — Area Amministratore.
 * Dashboard analitica con i SOLI dati reali del database (negozi, prodotti,
 * utenti, scan_log, categorie). Negozi demo e utenti di test esclusi; i demo
 * sono mostrati solo come separazione esplicita nella sezione Negozi.
 */
export default async function StatistichePage() {
  const item = getAdminNavItem("/amministratore/statistiche");
  const Icon = item.icon;
  const dati = await getDatiStatistiche();

  const { kpi, negozi, prodotti, utenti, scansioni, categorie } = dati;

  return (
    <div className="space-y-5">
      {/* Intestazione modulo */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Statistiche piattaforma
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Analisi dei dati reali di InCittà: negozi, prodotti, utenti,
              scansioni AI e categorie. Valori esatti dal database, demo e
              account di test esclusi.
            </p>
          </div>
        </div>
      </div>

      {/* Avvisi fonti dati */}
      {dati.avvisi.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm" role="status">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <div>
              <h2 className="text-sm font-black">Fonti dati parzialmente disponibili</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {dati.avvisi.map((avviso) => <li key={avviso}>{avviso}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. Panoramica KPI ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={Store} label="Negozi attivi" value={kpi.negoziAttivi} sub={`${kpi.negoziTotali} reali in piattaforma`} accent={{ bg: "bg-emerald-50", text: "text-emerald-600" }} />
        <KpiCard icon={Package} label="Prodotti" value={kpi.prodottiAttivi} sub={`${kpi.prodottiTotali} totali · ${kpi.prodottiAi} via AI`} accent={{ bg: "bg-amber-50", text: "text-amber-600" }} />
        <KpiCard icon={Users} label="Utenti" value={kpi.utentiTotali} sub="account registrati" accent={{ bg: "bg-violet-50", text: "text-violet-600" }} />
        <KpiCard icon={Activity} label="Scansioni AI" value={kpi.scansioniTotali} sub={`${kpi.scansioniOggi} oggi`} accent={{ bg: "bg-blue-50", text: "text-blue-600" }} />
        <KpiCard icon={FolderTree} label="Categorie usate" value={kpi.categorieAttive} sub="con negozi attivi" accent={{ bg: "bg-cyan-50", text: "text-cyan-600" }} />
      </div>

      {/* ── 2. Negozi ─────────────────────────────────────────────────────── */}
      <Sezione
        icon={Store}
        titolo="Negozi"
        sottotitolo="Stato e distribuzione dei negozi della piattaforma (i demo restano separati)"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Totale reali" value={negozi.totale} />
            <MiniStat label="Attivi" value={negozi.attivi} color="text-emerald-600" />
            <MiniStat label="Disattivati" value={negozi.disattivati} />
            <MiniStat label="In evidenza" value={negozi.inEvidenza} color="text-blue-600" />
            <MiniStat label="Demo (separati)" value={negozi.demo} color="text-violet-600" />
            <MiniStat label="Nel cestino" value={negozi.cestino} color="text-rose-600" />
          </div>
          <BarroneOrizzontale titolo="Per categoria" dati={negozi.perCategoria} vuoto="Nessuna categoria con negozi reali" />
        </div>
      </Sezione>

      {/* ── 3. Prodotti ───────────────────────────────────────────────────── */}
      <Sezione
        icon={Package}
        titolo="Prodotti"
        sottotitolo="Distribuzione del catalogo: origine (AI/manuale) e negozi più forniti"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Totale" value={prodotti.totale} />
            <MiniStat label="Attivi" value={prodotti.attivi} color="text-emerald-600" />
            <MiniStat label="Via AI" value={prodotti.ai} color="text-violet-600" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Cataloghi più forniti
            </h3>
            {prodotti.perNegozio.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Nessun prodotto nel catalogo</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {prodotti.perNegozio.map((riga) => (
                  <li key={riga.negozioId} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/amministratore/negozi/${riga.negozioId}`}
                      className="truncate text-sm font-semibold text-slate-700 transition hover:text-blue-700"
                    >
                      {riga.negozioNome}
                    </Link>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black tabular-nums text-slate-600">
                      {riga.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Sezione>

      {/* ── 4. Utenti ──────────────────────────────────────────────────────── */}
      <Sezione icon={Users} titolo="Utenti" sottotitolo="Distribuzione per ruolo e stato account">
        <div className="grid gap-4 lg:grid-cols-2">
          <BarroneRuoli dati={utenti.perRuolo} />
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Totale" value={utenti.totale} />
            <MiniStat label="Attivi" value={utenti.attivi} color="text-emerald-600" />
            <MiniStat label="Disattivati" value={utenti.disattivati} color="text-rose-600" />
          </div>
        </div>
      </Sezione>

      {/* ── 5. AI / Scansioni ─────────────────────────────────────────────── */}
      <Sezione
        icon={Bot}
        titolo="Intelligenza artificiale — Scansioni"
        sottotitolo="Dati reali di scan_log: volumi, provider, esiti e andamento a 30 giorni"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Totale" value={scansioni.totale} />
            <MiniStat label="Oggi" value={scansioni.oggi} color="text-blue-600" />
            <MiniStat label="Cache hit" value={scansioni.cacheHit} color="text-emerald-600" />
            <MiniStat label="Provider attivi" value={scansioni.perProvider.length} color="text-violet-600" />
          </div>
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Andamento ultimi 30 giorni
            </h3>
            <AndamentoScansioni dati={scansioni.andamento30gg} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <BarroneOrizzontale titolo="Per provider" dati={scansioni.perProvider} vuoto="Nessuna scansione negli ultimi 30 giorni" />
          <BarroneOrizzontale titolo="Per esito" dati={scansioni.perStatus} vuoto="Nessuna scansione negli ultimi 30 giorni" />
        </div>
      </Sezione>

      {/* ── 6. Categorie ───────────────────────────────────────────────────── */}
      <Sezione
        icon={FolderTree}
        titolo="Categorie"
        sottotitolo="Sezioni della piattaforma con negozi reali realmente associati"
      >
        {categorie.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna categoria associata ai negozi.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {categorie.map((c) => (
              <div key={c.chiave} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span className="truncate text-sm font-bold text-slate-800">{c.chiave}</span>
                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-black tabular-nums text-cyan-700">
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sezione>
    </div>
  );
}

// ── Sotto-componenti (stile coerente con l'Area Amministrazione) ─────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
  accent: { bg: string; text: string };
}) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent.bg}`}>
          <Icon className={`h-4 w-4 ${accent.text}`} aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, color = "text-slate-900" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

function Sezione({
  icon: Icon,
  titolo,
  sottotitolo,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titolo: string;
  sottotitolo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/70 bg-white p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-900">{titolo}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-400">{sottotitolo}</p>
        </div>
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BarroneOrizzontale({
  titolo,
  dati,
  vuoto,
  colore = "from-blue-500 to-blue-600",
}: {
  titolo: string;
  dati: { chiave: string; count: number }[];
  vuoto: string;
  colore?: string;
}) {
  const max = Math.max(...dati.map((d) => d.count), 1);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{titolo}</h3>
      {dati.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">{vuoto}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {dati.map((d) => (
            <div key={d.chiave} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-semibold text-slate-600">{d.chiave}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${colore}`}
                  style={{ width: `${Math.max(6, (d.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-black tabular-nums text-slate-700">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ETICHETTA_RUOLO: Record<string, string> = {
  amministratore: "Amministratori",
  commerciante: "Commercianti",
  utente: "Utenti",
};

function BarroneRuoli({ dati }: { dati: { chiave: string; count: number }[] }) {
  const max = Math.max(...dati.map((d) => d.count), 1);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Per ruolo</h3>
      {dati.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">Nessun utente registrato</p>
      ) : (
        <div className="mt-3 space-y-2">
          {dati.map((d) => (
            <div key={d.chiave} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-semibold text-slate-600">
                {ETICHETTA_RUOLO[d.chiave] ?? d.chiave}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600"
                  style={{ width: `${Math.max(6, (d.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-black tabular-nums text-slate-700">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AndamentoScansioni({
  dati,
}: {
  dati: { data: string; etichetta: string; count: number }[];
}) {
  const totale = dati.reduce((acc, g) => acc + g.count, 0);
  if (totale === 0) {
    return (
      <div className="mt-2 flex h-32 items-center justify-center rounded-2xl bg-slate-50">
        <p className="text-xs text-slate-400">Nessuna scansione negli ultimi 30 giorni</p>
      </div>
    );
  }
  const larghezza = 600;
  const altezza = 140;
  const max = Math.max(...dati.map((g) => g.count), 1);
  const punti = dati.map((g, i) => {
    const x = (i / Math.max(dati.length - 1, 1)) * larghezza;
    const y = altezza - (g.count / max) * (altezza - 20) - 8;
    return { x, y, ...g };
  });
  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${linea} L ${larghezza} ${altezza} L 0 ${altezza} Z`;

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} className="h-36 w-full" role="img" aria-label="Andamento scansioni ultimi 30 giorni">
        <defs>
          <linearGradient id="grad-scan30" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#grad-scan30)" />
        <path d={linea} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {punti.map((p, i) =>
          i % 5 === 0 ? (
            <text key={String(p.data)} x={p.x} y={altezza + 2} textAnchor="middle" className="fill-slate-400 text-[9px] font-semibold">
              {p.etichetta}
            </text>
          ) : null
        )}
      </svg>
      <p className="mt-1 text-center text-[11px] font-semibold text-slate-400">
        {totale} scansioni negli ultimi 30 giorni
      </p>
    </div>
  );
}