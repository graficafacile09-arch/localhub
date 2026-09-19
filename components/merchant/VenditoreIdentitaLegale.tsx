"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, CircleAlert } from "lucide-react";

type Form = {
  denominazione_legale: string; forma_giuridica: string; partita_iva: string;
  codice_fiscale: string; pec: string; sede_legale: string;
};

const EMPTY: Form = { denominazione_legale:"", forma_giuridica:"", partita_iva:"", codice_fiscale:"", pec:"", sede_legale:"" };

export default function VenditoreIdentitaLegale({ storeId }: { storeId: string }) {
  const [form,setForm]=useState<Form>(EMPTY); const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false); const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{ let mounted=true; fetch(`/api/merchant/stores/${storeId}/settings`).then(r=>r.json()).then(j=>{
    if(!mounted)return; const s=j?.data?.settings??{}; setForm({
      denominazione_legale:s.denominazione_legale??"", forma_giuridica:s.forma_giuridica??"",
      partita_iva:s.partita_iva??"", codice_fiscale:s.codice_fiscale??"", pec:s.pec??"", sede_legale:s.sede_legale??""
    });
  }).catch(()=>mounted&&setError("Impossibile caricare i dati del venditore.")).finally(()=>mounted&&setLoading(false)); return()=>{mounted=false}},[storeId]);
  const complete=Boolean(form.denominazione_legale.trim()&&form.partita_iva.trim()&&form.sede_legale.trim());
  const set=(key:keyof Form,value:string)=>{setForm(x=>({...x,[key]:value}));setMessage(null);setError(null)};
  async function save(){setSaving(true);setMessage(null);setError(null);try{
    const r=await fetch(`/api/merchant/stores/${storeId}/settings`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      denominazione_legale:form.denominazione_legale.trim(), forma_giuridica:form.forma_giuridica.trim(),
      partita_iva:form.partita_iva.trim().toUpperCase(), codice_fiscale:form.codice_fiscale.trim().toUpperCase(),
      pec:form.pec.trim().toLowerCase(), sede_legale:form.sede_legale.trim()
    })}); const j=await r.json(); if(!r.ok||!j?.success)throw new Error(j?.error?.message??"Impossibile salvare i dati.");
    setMessage("Dati legali salvati.");
  }catch(e){setError(e instanceof Error?e.message:"Impossibile salvare i dati.");}finally{setSaving(false)}}
  if(loading)return <p className="text-sm text-slate-500">Caricamento dati legali…</p>;
  return <div className="space-y-5">
    <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700"/><div><p className="font-bold text-slate-900">Identità del venditore</p><p className="mt-1 text-sm leading-5 text-slate-600">Dati del soggetto che vende prodotti o servizi tramite InCittà. Devono essere corretti e aggiornati.</p></div></div>
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${complete?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-amber-200 bg-amber-50 text-amber-900"}`}>{complete?<CheckCircle2 className="h-4 w-4"/>:<CircleAlert className="h-4 w-4"/>}<span>{complete?"Dati essenziali compilati":"Completa i dati essenziali del venditore"}</span></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {([["denominazione_legale","Denominazione legale *","sm:col-span-2","Es. Rossi Mario"],["forma_giuridica","Forma giuridica","","Es. Ditta individuale / SRL"],["partita_iva","Partita IVA *","","11 cifre"],["codice_fiscale","Codice fiscale","",""],["pec","PEC","","pec@esempio.it"],["sede_legale","Sede legale *","sm:col-span-2","Via, numero civico, CAP, Comune (Provincia)"]] as const).map(([key,label,span,placeholder])=><label key={key} className={span}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span><input value={form[key]} onChange={e=>set(key,key==="partita_iva"?e.target.value.replace(/\D/g,""):e.target.value)} placeholder={placeholder} maxLength={key==="partita_iva"?11:key==="codice_fiscale"?16:undefined} type={key==="pec"?"email":"text"} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"/></label>)}
    </div>
    <p className="text-xs leading-5 text-slate-500">La verifica dell’identità non viene dichiarata automaticamente: sarà gestita separatamente.</p>
    {message&&<p className="text-sm font-semibold text-emerald-700">{message}</p>}{error&&<p className="text-sm font-semibold text-red-700">{error}</p>}
    <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{saving?"Salvataggio…":"Salva dati legali"}</button>
  </div>;
}
