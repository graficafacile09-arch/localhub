"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, AlertTriangle, Check } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea, Toggle, SaveBar, type StatoSalvataggio } from "./ModuleFields";
import {
  RICHIESTA_INFO_DEFAULT,
  type ConfigRichiestaInfo,
  type TipoRichiestaInfo,
} from "@/lib/negozio/richiesta-info";

type Props = { storeId: string };

function normalizza(raw: unknown): ConfigRichiestaInfo {
  if (!raw || typeof raw !== "object") return { ...RICHIESTA_INFO_DEFAULT };
  const r = raw as Partial<ConfigRichiestaInfo>;
  return {
    attiva: r.attiva === true,
    titolo:
      typeof r.titolo === "string" && r.titolo.trim()
        ? r.titolo.trim()
        : RICHIESTA_INFO_DEFAULT.titolo,
    testo: typeof r.testo === "string" ? r.testo : RICHIESTA_INFO_DEFAULT.testo,
    tipo:
      r.tipo === "preventivo" || r.tipo === "consulenza"
        ? r.tipo
        : "informazioni",
    telefono_obbligatorio: r.telefono_obbligatorio === true,
    email_obbligatoria: r.email_obbligatoria !== false,
    messaggio_obbligatorio: r.messaggio_obbligatorio !== false,
  };
}

const TIPI: { value: TipoRichiestaInfo; label: string }[] = [
  { value: "informazioni", label: "Richiedi informazioni" },
  { value: "preventivo", label: "Richiedi preventivo" },
  { value: "consulenza", label: "Richiedi consulenza" },
];

export default function RichiestaInfoModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigRichiestaInfo>({ ...RICHIESTA_INFO_DEFAULT });
  const [emailNegozio, setEmailNegozio] = useState<string>("");
  const [original, setOriginal] = useState("");
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  /** Come in ServiziModule: un fetch asincrono non deve sovrascrivere le modifiche in corso. */
  const editedRef = useRef(false);

  useEffect(() => {
    let attivo = true;
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        setLoading(false);
        if (!json.success) return;
        if (editedRef.current) return;
        const data = (json.data.settings.data ?? {}) as Record<string, unknown>;
        const configNormalizzata = normalizza(data.richiesta_info);
        setConfig(configNormalizzata);
        setOriginal(JSON.stringify(configNormalizzata));
        setEmailNegozio(
          typeof json.data.settings.email_negozio === "string"
            ? json.data.settings.email_negozio
            : ""
        );
      })
      .catch(() => {
        if (attivo) setLoading(false);
      });
    return () => {
      attivo = false;
    };
  }, [storeId]);

  const dirty = JSON.stringify(config) !== original;

  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  function update(patch: Partial<ConfigRichiestaInfo>) {
    editedRef.current = true;
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setMessaggio(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { richiesta_info: config } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal(JSON.stringify(config));
      setMessaggio({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ModuleShell
        icon={<MessageSquare className="h-4 w-4" />}
        title="Richiesta informazioni"
        subtitle="Ricevi richieste dai clienti dalla tua pagina."
        id="richiesta_info"
      >
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  const senzaEmail = !emailNegozio.trim();

  return (
    <ModuleShell
      icon={<MessageSquare className="h-4 w-4" />}
      title="Richiesta informazioni"
      subtitle="Ricevi richieste dai clienti dalla tua pagina."
      id="richiesta_info"
    >
      {senzaEmail && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Per ricevere le richieste devi prima configurare un&apos;email di
            contatto nella sezione &ldquo;Contatti&rdquo; (campo &ldquo;Email
            negozio&rdquo;). Senza email le richieste non possono essere consegnate.
          </span>
        </div>
      )}

      <div className="space-y-4">
        <Toggle
          icon={<MessageSquare className="h-4 w-4 text-blue-600" />}
          label="Attiva richieste"
          description="Mostra il pulsante di richiesta sulla tua pagina pubblica"
          checked={config.attiva}
          onChange={(v) => update({ attiva: v })}
        />

        {config.attiva && (
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <Field
              label="Titolo pulsante"
              value={config.titolo}
              onChange={(v) => update({ titolo: v })}
              maxLength={60}
              placeholder="es. Richiedi informazioni"
            />

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Tipo richiesta</p>
              <div className="space-y-1.5">
                {TIPI.map((t) => (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300"
                  >
                    <input
                      type="radio"
                      name="tipo-richiesta"
                      value={t.value}
                      checked={config.tipo === t.value}
                      onChange={() => update({ tipo: t.value })}
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <TextArea
              label="Testo introduttivo"
              value={config.testo}
              onChange={(v) => update({ testo: v })}
              rows={2}
            />

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Dati cliente</p>
              <div className="space-y-1.5">
                <Toggle
                  label="Email obbligatoria"
                  description="Il cliente deve inserire la sua email"
                  checked={config.email_obbligatoria}
                  onChange={(v) => update({ email_obbligatoria: v })}
                />
                <Toggle
                  label="Telefono obbligatorio"
                  description="Il cliente deve inserire il suo telefono"
                  checked={config.telefono_obbligatorio}
                  onChange={(v) => update({ telefono_obbligatorio: v })}
                />
                <Toggle
                  label="Messaggio obbligatorio"
                  description="Il cliente deve scrivere un messaggio"
                  checked={config.messaggio_obbligatorio}
                  onChange={(v) => update({ messaggio_obbligatorio: v })}
                />
                <p className="text-[10px] leading-4 text-slate-400">
                  Il nome è sempre richiesto. Serve sempre almeno un recapito
                  (email o telefono).
                </p>
              </div>
            </div>

            {/* Preview CTA */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-500">
                Anteprima
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white">
                  <MessageSquare className="h-4 w-4" />
                  {config.titolo}
                </span>
                {config.attiva && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Pulsante visibile ai clienti
                  </span>
                )}
              </div>
              {config.testo && (
                <p className="mt-2 text-[11px] leading-4 text-slate-600">{config.testo}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
    </ModuleShell>
  );
}
