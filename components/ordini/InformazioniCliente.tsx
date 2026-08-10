import { Mail, Phone, User } from "lucide-react";
import { Sezione, RigaDettaglio } from "./Sezione";

/**
 * Dati cliente — sezione condivisa del dettaglio venditore.
 * Email/telefono mostrati SOLO se realmente presenti nel DB (mai inventati).
 */
export function InformazioniCliente({
  nome,
  cognome,
  telefono,
  email,
}: {
  nome: string;
  cognome: string;
  telefono: string | null;
  email: string | null;
}) {
  return (
    <Sezione icon={User} titolo="Cliente">
      <div className="space-y-1.5">
        <p className="text-lg font-black tracking-tight text-slate-900">
          {nome} {cognome}
        </p>
        {telefono && (
          <RigaDettaglio
            etichetta="Telefono"
            valore={
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden />
                {telefono}
              </span>
            }
          />
        )}
        {email && (
          <RigaDettaglio
            etichetta="Email"
            valore={
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-slate-400" aria-hidden />
                {email}
              </span>
            }
          />
        )}
      </div>
    </Sezione>
  );
}
