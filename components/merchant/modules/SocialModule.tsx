"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Music2, Video } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function SocialModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ facebook: "", instagram: "", whatsapp: "", tiktok: "", youtube: "" });
  const [original, setOriginal] = useState({ ...form });

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const vals = {
            facebook: s.facebook ?? "",
            instagram: s.instagram ?? "",
            whatsapp: s.whatsapp ?? "",
            tiktok: s.tiktok ?? "",
            youtube: s.youtube ?? "",
          };
          setForm(vals);
          setOriginal({ ...vals });
        }
        setLoading(false);
      });
  }, [storeId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setOriginal({ ...form });
    setSaving(false);
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  if (loading) {
    return (
      <ModuleShell icon={<MessageCircle className="h-4 w-4" />} title="Social" subtitle="Caricamento..." id="social">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<MessageCircle className="h-4 w-4" />} title="Social" subtitle="Link a profili social" id="social">
      <div className="space-y-4">
        <SocialField icon={<MessageCircle className="h-4 w-4 text-blue-600" />} label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} placeholder="+39 333 1234567" prefix="" />
        <SocialField icon={<FacebookIcon />} label="Facebook" value={form.facebook} onChange={(v) => setForm((f) => ({ ...f, facebook: v }))} prefix="facebook.com/" placeholder="nome.negozio" />
        <SocialField icon={<InstagramIcon />} label="Instagram" value={form.instagram} onChange={(v) => setForm((f) => ({ ...f, instagram: v }))} prefix="instagram.com/" placeholder="nome.negozio" />
        <SocialField icon={<Music2 className="h-4 w-4 text-slate-700" />} label="TikTok" value={form.tiktok} onChange={(v) => setForm((f) => ({ ...f, tiktok: v }))} prefix="tiktok.com/@" placeholder="nome.negozio" />
        <SocialField icon={<Video className="h-4 w-4 text-blue-600" />} label="YouTube" value={form.youtube} onChange={(v) => setForm((f) => ({ ...f, youtube: v }))} prefix="youtube.com/@" placeholder="nome.negozio" />
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}

function SocialField({ icon, label, value, onChange, prefix, placeholder }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void;
  prefix?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <label className="text-xs font-semibold text-slate-700">{label}</label>
        <div className="mt-1 flex items-center gap-0">
          {prefix && <span className="shrink-0 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-400">{prefix}</span>}
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className={`h-9 w-full ${prefix ? "rounded-r-lg" : "rounded-lg"} border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-100`}
          />
        </div>
      </div>
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}
