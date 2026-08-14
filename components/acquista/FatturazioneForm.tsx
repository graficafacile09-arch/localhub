"use client";

import { Building2 } from "lucide-react";

/**
 * Indirizzo di fatturazione a scomparsa (buy-now e checkout carrello).
 *
 * Controllato dal parent (unica fonte di verità): `value` + `onChange`.
 * Default chiuso: il cliente usa i dati di spedizione. Attivando
 * "Usa un indirizzo di fatturazione diverso" compaiono i campi, tutti
 * obbligatori (validazione nel parent tramite validaDatiFatturazione).
 */

export type DatiFatturazione = {
  diversa: boolean;
  nome: string;
  cognome: string;
  indirizzo: string;
  numeroCivico: string;
  cap: string;
  comune: string;
  provincia: string;
  nazione: string;
};

export const DATI_FATTURAZIONE_VUOTI: DatiFatturazione = {
  diversa: false,
  nome: "",
  cognome: "",
  indirizzo: "",
  numeroCivico: "",
  cap: "",
  comune: "",
  provincia: "",
  nazione: "Italia",
};

/** Ritorna un oggetto { campo: messaggio } per i campi mancanti/invalidi. */
export function validaDatiFatturazione(d: DatiFatturazione): Record<string, string> {
  if (!d.diversa) return {};
  const e: Record<string, string> = {};
  if (!d.nome.trim()) e.nome = "Inserisci il nome.";
  if (!d.cognome.trim()) e.cognome = "Inserisci il cognome.";
  if (!d.indirizzo.trim()) e.indirizzo = "Inserisci l'indirizzo.";
  if (!d.numeroCivico.trim()) e.numeroCivico = "Inserisci il numero civico.";
  if (!/^\d{5}$/.test(d.cap.trim())) e.cap = "Il CAP deve essere di 5 cifre.";
  if (!d.comune.trim()) e.comune = "Inserisci il comune.";
  if (!d.provincia.trim()) e.provincia = "Inserisci la provincia.";
  if (!d.nazione.trim()) e.nazione = "Inserisci la nazione.";
  return e;
}

export default function FatturazioneForm({
  value,
  onChange,
  errori,
}: {
  value: DatiFatturazione;
  onChange: (v: DatiFatturazione) => void;
  /** Errori per campo (nome, cognome, indirizzo, ...) mostrati vicino al campo. */
  errori?: Record<string, string>;
}) {
  const set = (campo: keyof DatiFatturazione, val: string) =>
    onChange({ ...value, [campo]: val });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">
        <Building2 className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
        Indirizzo di fatturazione
      </h3>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.diversa}
          onChange={(e) => onChange({ ...value, diversa: e.target.checked })}
          className="h-4 w-4 accent-blue-600"
        />
        Usa un indirizzo di fatturazione diverso
      </label>

      {value.diversa && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CampoFatt
              label="Nome"
              required
              value={value.nome}
              onChange={(v) => set("nome", v)}
              errore={errori?.nome}
            />
            <CampoFatt
              label="Cognome"
              required
              value={value.cognome}
              onChange={(v) => set("cognome", v)}
              errore={errori?.cognome}
            />
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <CampoFatt
              label="Indirizzo"
              required
              value={value.indirizzo}
              onChange={(v) => set("indirizzo", v)}
              errore={errori?.indirizzo}
            />
            <CampoFatt
              label="Numero civico"
              required
              value={value.numeroCivico}
              onChange={(v) => set("numeroCivico", v)}
              errore={errori?.numeroCivico}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoFatt
              label="CAP"
              required
              value={value.cap}
              onChange={(v) => set("cap", v)}
              errore={errori?.cap}
            />
            <CampoFatt
              label="Comune"
              required
              value={value.comune}
              onChange={(v) => set("comune", v)}
              errore={errori?.comune}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoFatt
              label="Provincia"
              required
              value={value.provincia}
              onChange={(v) => set("provincia", v)}
              errore={errori?.provincia}
            />
            <CampoFatt
              label="Nazione"
              required
              value={value.nazione}
              onChange={(v) => set("nazione", v)}
              errore={errori?.nazione}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CampoFatt({
  label,
  value,
  onChange,
  required = false,
  errore,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  errore?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-blue-500"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        required={required}
        aria-required={required}
        aria-invalid={!!errore}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
      {errore && (
        <p className="mt-1 text-[11px] font-semibold text-blue-600">{errore}</p>
      )}
    </div>
  );
}
