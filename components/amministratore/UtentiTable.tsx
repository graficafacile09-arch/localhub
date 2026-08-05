import { Mail, ShieldAlert, Store } from "lucide-react";
import type { RuoloUtente, StatoUtente, Utente } from "@/lib/amministratore/types";
import { RUOLI_UTENTE } from "@/lib/amministratore/types";

const formatData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const STILE_RUOLO: Record<RuoloUtente, string> = {
  amministratore: "bg-violet-50 text-violet-700 ring-violet-200",
  commerciante: "bg-blue-50 text-blue-700 ring-blue-200",
  utente: "bg-slate-100 text-slate-600 ring-slate-200",
};

function BadgeRuolo({ ruolo }: { ruolo: RuoloUtente }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${STILE_RUOLO[ruolo]}`}
    >
      {RUOLI_UTENTE[ruolo].label}
    </span>
  );
}

function BadgeStato({ stato }: { stato: StatoUtente }) {
  if (stato === "attivo") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Attivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      Disattivato
    </span>
  );
}

function Avatar({ nome }: { nome: string }) {
  const iniziali = nome
    .split(" ")
    .map((parte) => parte.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-blue-700 text-xs font-black text-white ring-2 ring-blue-100"
    >
      {iniziali}
    </span>
  );
}

/**
 * Tabella utenti del modulo /amministratore/utenti — dati reali dal DB.
 * Colonne: Nome, Email, Ruolo, Stato, Ultimo accesso, Azioni.
 */
import UtentiActionsMenu from "./UtentiActionsMenu";

type AggiornamentoUtente = Partial<Pick<Utente, "ruolo" | "stato">>;

export default function UtentiTable({
  utenti,
  onAggiorna,
  onDettaglio,
  onElimina,
}: {
  utenti: Utente[];
  onAggiorna?: (id: string, aggiornamento: AggiornamentoUtente) => void;
  onDettaglio?: (utente: Utente) => void;
  onElimina?: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <th className="px-5 py-3.5 font-semibold">Nome</th>
              <th className="px-5 py-3.5 font-semibold">Email</th>
              <th className="px-5 py-3.5 font-semibold">Ruolo</th>
              <th className="px-5 py-3.5 font-semibold">Stato</th>
              <th className="px-5 py-3.5 font-semibold">Ultimo accesso</th>
              <th className="px-5 py-3.5 text-right font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {utenti.map((utente) => (
              <tr
                key={utente.id}
                className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/50"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar nome={utente.nome} />
                    <div>
                      <p className="font-bold text-slate-800">{utente.nome}</p>
                      {utente.negozi != null && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                          <Store className="h-3 w-3" aria-hidden />
                          {utente.negozi}{" "}
                          {utente.negozi === 1 ? "negozio" : "negozi"}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Mail className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                    {utente.email}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <BadgeRuolo ruolo={utente.ruolo} />
                </td>
                <td className="px-5 py-4">
                  <BadgeStato stato={utente.stato} />
                </td>
                <td className="px-5 py-4 text-slate-500">
                  {utente.ultimoAccesso
                    ? formatData.format(new Date(utente.ultimoAccesso))
                    : "Mai"}
                </td>
                <td className="px-5 py-4 text-right">
                  <UtentiActionsMenu
                    utente={utente}
                    onAggiorna={onAggiorna}
                    onDettaglio={onDettaglio}
                    onElimina={onElimina}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {utenti.length === 0 && (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <ShieldAlert className="h-8 w-8 text-slate-200" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Nessun utente con questo ruolo
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Prova a selezionare un&apos;altra tab.
          </p>
        </div>
      )}
    </div>
  );
}
