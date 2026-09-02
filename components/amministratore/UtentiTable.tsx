import {
  BadgeCheck,
  MailX,
  ShieldAlert,
  Store,
} from "lucide-react";
import type { RuoloUtente, Utente } from "@/lib/amministratore/types";
import { RUOLI_UTENTE, STATO_ACCOUNT } from "@/lib/amministratore/types";
import UtentiActionsMenu from "./UtentiActionsMenu";

const formatData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function ChipRuolo({ ruolo }: { ruolo: RuoloUtente }) {
  const stile = RUOLI_UTENTE[ruolo].chip;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${stile}`}
    >
      {RUOLI_UTENTE[ruolo].label}
    </span>
  );
}

function ChipStato({ utente }: { utente: Utente }) {
  const stile = STATO_ACCOUNT[utente.stato];
  return (
    <span
      title={utente.blocco?.motivo ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${stile.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stile.dot}`} aria-hidden />
      {stile.label}
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white"
    >
      {iniziali}
    </span>
  );
}

/**
 * Tabella utenti del modulo /amministratore/utenti — dati reali dal DB.
 * Colonne: Utente, Email (con verifica), Ruoli (multi), Stato account,
 * Ultimo accesso, Azioni.
 */
export default function UtentiTable({
  utenti,
  onDettaglio,
  onElimina,
}: {
  utenti: Utente[];
  onDettaglio?: (utente: Utente) => void;
  onElimina?: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <th className="px-5 py-3.5 font-semibold">Utente</th>
              <th className="px-5 py-3.5 font-semibold">Email</th>
              <th className="px-5 py-3.5 font-semibold">Ruoli</th>
              <th className="px-5 py-3.5 font-semibold">Stato</th>
              <th className="px-5 py-3.5 font-semibold">Ultimo accesso</th>
              <th className="px-5 py-3.5 text-right font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {utenti.map((utente) => (
              <tr
                key={utente.id}
                className="border-b border-slate-50 transition-colors last:border-0 hover:bg-yellow-50/50"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar nome={utente.nome} />
                    <div>
                      <p className="flex items-center gap-1.5 font-bold text-slate-800">
                        {utente.nome}
                        {utente.protetto && (
                          <ShieldAlert
                            className="h-3.5 w-3.5 text-blue-500"
                            aria-label="Account amministratore autorizzato"
                          />
                        )}
                      </p>
                      {utente.numeroNegozi > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                          <Store className="h-3 w-3" aria-hidden />
                          {utente.numeroNegozi}{" "}
                          {utente.numeroNegozi === 1 ? "negozio" : "negozi"}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    {utente.emailVerificata ? (
                      <BadgeCheck
                        className="h-3.5 w-3.5 text-emerald-500"
                        aria-label="Email verificata"
                      />
                    ) : (
                      <MailX
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-label="Email non verificata"
                      />
                    )}
                    {utente.email}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {utente.ruoli.map((ruolo) => (
                      <ChipRuolo key={ruolo} ruolo={ruolo} />
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <ChipStato utente={utente} />
                </td>
                <td className="px-5 py-4 text-slate-500">
                  {utente.ultimoAccesso
                    ? formatData.format(new Date(utente.ultimoAccesso))
                    : "Mai"}
                </td>
                <td className="px-5 py-4 text-right">
                  <UtentiActionsMenu
                    utente={utente}
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
            Nessun utente trovato
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Modifica i filtri o la ricerca per vedere altri risultati.
          </p>
        </div>
      )}
    </div>
  );
}
