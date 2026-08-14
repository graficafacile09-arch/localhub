"use client";

import { X } from "lucide-react";
import { useState } from "react";

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

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
};

export function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {label}{required && <span className="text-blue-400">*</span>}
      </label>
      <select
        value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="">Seleziona</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

type TextAreaProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
};

export function TextArea({ label, value, onChange, rows = 3 }: TextAreaProps) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">{label}</label>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

type ToggleProps = {
  icon?: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

export function Toggle({ icon, label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 transition hover:border-slate-200">
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{description}</p>
      </div>
      <div className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-200"}`}>
        <div className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-4" : "translate-x-0"}`} />
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      </div>
    </label>
  );
}

type TagsInputProps = {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
};

export function TagsInput({ value, onChange, placeholder }: TagsInputProps) {
  const [input, setInput] = useState("");
  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
            {item}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== item))} className="text-blue-400 hover:text-blue-700">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="h-9 w-full rounded-xl border border-sche-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

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
        className="btn-cta h-11 gap-2 px-6 text-sm disabled:opacity-50"
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
