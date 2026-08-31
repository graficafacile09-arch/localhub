"use client";

/** Campo di input testuale (nome, cognome, indirizzo, città, CAP, provincia, telefono…). */
type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
};

export function Field({ label, value, onChange, type = "text", required, maxLength, placeholder }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {label}{required && <span className="text-blue-400">*</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        required={required} maxLength={maxLength} placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

/** Barra di salvataggio con pulsante e indicatore di stato. */
type SaveBarProps = {
  saving: boolean;
  onSave: () => void;
  dirty?: boolean;
};

export function SaveBar({ saving, onSave, dirty }: SaveBarProps) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-yellow-400 hover:text-blue-900 active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? "Salvataggio..." : "Salva modifiche"}
      </button>
      {dirty && !saving && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-600">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
          Non salvato
        </span>
      )}
    </div>
  );
}
