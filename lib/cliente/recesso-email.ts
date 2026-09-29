import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";
const TIMEOUT_MS = 8_000;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function euro(value) { return Number(value || 0).toFixed(2).replace(".", ","); }
function dataIT(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("it-IT");
}
function timeout(promise) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout email")), TIMEOUT_MS))]);
}
function statoLabel(stato) {
  const map = {
    richiesta: "Richiesta ricevuta", presa_in_carico: "Pratica presa in carico",
    reso_da_spedire: "Istruzioni per il reso", reso_ricevuto: "Reso ricevuto",
    rimborso_in_corso: "Rimborso avviato", rimborsata: "Rimborso effettuato",
    rifiutata: "Richiesta rifiutata", chiusa: "Pratica chiusa",
  };
  return map[stato] ?? stato;
}

function righeHtml(righe) {
  return (righe ?? []).map((r) => {
    const regola = r.recesso_applicabile === false
      ? `<div style="font-size:12px;color:#b45309;margin-top:3px">Esclusione: ${esc(r.recesso_esclusione_dettaglio || r.recesso_esclusione_codice || "prevista")}</div>`
      : "";
    return `<tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0"><strong>${esc(r.nome_prodotto)}</strong><div style="font-size:12px;color:#64748b">${Number(r.quantita_richiesta)} × €${euro(r.prezzo_unitario)}</div>${regola}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-weight:700;white-space:nowrap">€${euro(Number(r.prezzo_unitario) * Number(r.quantita_richiesta))}</td></tr>`;
  }).join("");
}

function buildHtml(richiesta, righe, extra = "") {
  const venditore = richiesta.venditore_denominazione_legale || richiesta.venditore_nome_commerciale || "Venditore";
  const link = SITE_URL + "/ordini/conferma/" + encodeURIComponent(String(richiesta.ordine_id));
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:600px;margin:auto;padding:24px 16px"><div style="background:#059669;color:#fff;padding:22px;border-radius:16px 16px 0 0"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#d1fae5">InCittà · Diritto di recesso</div><h1 style="font-size:21px;margin:8px 0 0">${esc(richiesta.numero)}</h1><p style="margin:7px 0 0">${esc(statoLabel(richiesta.stato))}</p></div><div style="background:#fff;padding:24px;border-radius:0 0 16px 16px"><p style="margin-top:0">Ciao ${esc(richiesta.cliente_nome)},</p><p>la tua richiesta di recesso è stata registrata con data e ora e questa email costituisce una comunicazione su supporto durevole.</p>${extra}<h2 style="font-size:14px;margin:22px 0 7px">Dettagli della pratica</h2><p style="margin:4px 0;font-size:14px">Pratica: <strong>${esc(richiesta.numero)}</strong><br>Ricezione: ${esc(dataIT(richiesta.ricevuta_at))}<br>Termine ordinario: ${esc(richiesta.termine_recesso_at ? dataIT(richiesta.termine_recesso_at) : "non ancora decorrente")}</p><h2 style="font-size:14px;margin:22px 0 7px">Articoli richiesti</h2><table width="100%" cellpadding="0" cellspacing="0">${righeHtml(righe)}</table><p style="margin:14px 0;font-size:14px"><strong>Importo previsto: €${euro(richiesta.importo_previsto)}</strong></p><h2 style="font-size:14px;margin:22px 0 7px">Venditore</h2><p style="margin:4px 0;font-size:14px;line-height:1.55">${esc(venditore)}${richiesta.venditore_partita_iva ? "<br>P. IVA: " + esc(richiesta.venditore_partita_iva) : ""}${richiesta.venditore_sede_legale ? "<br>Sede legale: " + esc(richiesta.venditore_sede_legale) : ""}${richiesta.venditore_email ? "<br>Email: " + esc(richiesta.venditore_email) : ""}</p><h2 style="font-size:14px;margin:22px 0 7px">Dichiarazione</h2><p style="font-size:13px;line-height:1.55;color:#475569">${esc(richiesta.dichiarazione_testo)}</p><p style="margin:22px 0 0;text-align:center"><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">Visualizza ordine</a></p><p style="font-size:11px;color:#94a3b8;text-align:center;margin:20px 0 0">Conserva questa email insieme alla documentazione dell'ordine.</p></div></div></body></html>`;
}

async function loadRequest(id) {
  const db = createAdminSupabaseClient();
  const { data: richiesta, error } = await db.from("richieste_recesso").select("*").eq("id", id).maybeSingle();
  if (error || !richiesta) throw new Error("richiesta non trovata");
  const { data: righe } = await db.from("richieste_recesso_righe").select("nome_prodotto, prezzo_unitario, quantita_richiesta, recesso_applicabile, recesso_esclusione_codice, recesso_esclusione_dettaglio").eq("richiesta_id", id).order("created_at", { ascending: true });
  return { db, richiesta, righe: righe ?? [] };
}

export async function inviaConfermaRecesso(richiestaId) {
  const { db, richiesta, righe } = await loadRequest(richiestaId);
  if (!richiesta.cliente_email || richiesta.conferma_esito === "inviata") return { stato: "skipped" };
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await db.from("richieste_recesso").update({ conferma_esito: "fallita", updated_at: new Date().toISOString() }).eq("id", richiestaId);
    return { stato: "skipped", motivo: "RESEND_API_KEY non configurata" };
  }
  const resend = new Resend(resendKey);
  const text = [
    `Ciao ${richiesta.cliente_nome},`, "", "la tua richiesta di recesso è stata registrata.",
    `Pratica: ${richiesta.numero}`, `Ricezione: ${dataIT(richiesta.ricevuta_at)}`,
    `Termine ordinario: ${richiesta.termine_recesso_at ? dataIT(richiesta.termine_recesso_at) : "non ancora decorrente"}`,
    "", "Articoli:", ...righe.map(r => `- ${r.nome_prodotto} — quantità ${r.quantita_richiesta} — €${euro(Number(r.prezzo_unitario) * Number(r.quantita_richiesta))}`),
    `", Importo previsto: €${euro(richiesta.importo_previsto)}`, "", richiesta.dichiarazione_testo,
  ].join("\\n");
  try {
    const result = await timeout(resend.emails.send({ from: FROM_EMAIL, to: String(richiesta.cliente_email), subject: `Ricevuta richiesta di recesso ${richiesta.numero} — InCittà`, html: buildHtml(richiesta, righe), text }));
    if (result?.error) throw new Error(result.error.message);
    await db.from("richieste_recesso").update({ conferma_inviata_at: new Date().toISOString(), conferma_email: String(richiesta.cliente_email), conferma_message_id: result.data?.id ?? null, conferma_esito: "inviata", updated_at: new Date().toISOString() }).eq("id", richiestaId);
    if (richiesta.venditore_email) {
      await resend.emails.send({ from: FROM_EMAIL, to: String(richiesta.venditore_email), subject: `Nuova richiesta di recesso ${richiesta.numero} — InCittà`, text: `Nuova richiesta di recesso. Pratica ${richiesta.numero}. Cliente: ${richiesta.cliente_nome}. Ricezione: ${dataIT(richiesta.ricevuta_at)}. Gestisci la pratica dall'area venditore.` });
    }
    return { stato: "sent" };
  } catch (error) {
    await db.from("richieste_recesso").update({ conferma_esito: "fallita", updated_at: new Date().toISOString() }).eq("id", richiestaId);
    console.error("[recesso-email] conferma fallita:", error instanceof Error ? error.message : error);
    return { stato: "error" };
  }
}

export async function inviaAggiornamentoRecesso(richiestaId, nota = null) {
  const { richiesta, righe } = await loadRequest(richiestaId);
  if (!richiesta.cliente_email) return { stato: "skipped" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { stato: "skipped", motivo: "RESEND_API_KEY non configurata" };
  const resend = new Resend(key);
  const extra = nota ? `<div style="margin:16px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><strong>Comunicazione del venditore</strong><p style="margin:6px 0 0;white-space:pre-wrap">${esc(nota)}</p></div>` : "";
  try {
    const result = await timeout(resend.emails.send({ from: FROM_EMAIL, to: String(richiesta.cliente_email), subject: `${statoLabel(richiesta.stato)} — pratica ${richiesta.numero}`, html: buildHtml(richiesta, righe, extra), text: `Pratica ${richiesta.numero} — ${statoLabel(richiesta.stato)}\\n\\n${nota || "La pratica è stata aggiornata dal venditore."}` }));
    if (result?.error) throw new Error(result.error.message);
    return { stato: "sent" };
  } catch (error) {
    console.error("[recesso-email] aggiornamento fallito:", error instanceof Error ? error.message : error);
    return { stato: "error" };
  }
}
