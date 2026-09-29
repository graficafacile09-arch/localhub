import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function euro(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}
function dataIT(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("it-IT");
}
function label(stato) {
  return ({
    richiesta: "Richiesta ricevuta",
    presa_in_carico: "Pratica presa in carico",
    reso_da_spedire: "Istruzioni per il reso",
    reso_ricevuto: "Reso ricevuto",
    rimborso_in_corso: "Rimborso avviato",
    rimborsata: "Rimborso effettuato",
    rifiutata: "Richiesta rifiutata",
    chiusa: "Pratica chiusa",
  })[stato] ?? stato;
}
async function carica(id) {
  const db = createAdminSupabaseClient();
  const { data: richiesta, error } = await db.from("richieste_recesso").select("*").eq("id", id).maybeSingle();
  if (error || !richiesta) throw new Error("richiesta non trovata");
  const { data: righe } = await db.from("richieste_recesso_righe")
    .select("nome_prodotto,prezzo_unitario,quantita_richiesta")
    .eq("richiesta_id", id).order("created_at", { ascending: true });
  return { db, richiesta, righe: righe ?? [] };
}
function html(r, righe, nota = "") {
  const articoli = righe.map((x) =>
    "<li>" + esc(x.nome_prodotto) + " — quantità " + esc(x.quantita_richiesta) +
    " — €" + euro(Number(x.prezzo_unitario) * Number(x.quantita_richiesta)) + "</li>"
  ).join("");
  const venditore = esc(r.venditore_denominazione_legale || r.venditore_nome_commerciale || "Venditore");
  const extra = nota ? "<div><strong>Comunicazione del venditore</strong><p>" + esc(nota) + "</p></div>" : "";
  const link = SITE_URL + "/ordini/conferma/" + encodeURIComponent(String(r.ordine_id));
  return "<!doctype html><html lang=\"it\"><body style=\"font-family:Arial,sans-serif;color:#0f172a\">" +
    "<h2>InCittà — Diritto di recesso</h2><p><strong>" + esc(label(r.stato)) + "</strong></p>" +
    "<p>Ciao " + esc(r.cliente_nome) + ",</p>" +
    "<p>La pratica <strong>" + esc(r.numero) + "</strong> è stata registrata/aggiornata. Questa comunicazione è trasmessa su supporto durevole.</p>" +
    extra +
    "<h3>Dettagli</h3><p>Ricezione: " + esc(dataIT(r.ricevuta_at)) +
    "<br>Termine ordinario: " + esc(r.termine_recesso_at ? dataIT(r.termine_recesso_at) : "non ancora decorrente") +
    "<br>Importo previsto: €" + euro(r.importo_previsto) + "</p>" +
    "<h3>Articoli</h3><ul>" + articoli + "</ul>" +
    "<h3>Venditore</h3><p>" + venditore +
    (r.venditore_partita_iva ? "<br>P. IVA: " + esc(r.venditore_partita_iva) : "") +
    (r.venditore_sede_legale ? "<br>Sede legale: " + esc(r.venditore_sede_legale) : "") +
    (r.venditore_email ? "<br>Email: " + esc(r.venditore_email) : "") + "</p>" +
    "<h3>Dichiarazione</h3><p>" + esc(r.dichiarazione_testo) + "</p>" +
    "<p><a href=\"" + esc(link) + "\">Visualizza ordine</a></p>" +
    "</body></html>";
}
async function send(to, subject, bodyHtml, bodyText) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { stato: "skipped" };
  const resend = new Resend(key);
  const result = await Promise.race([
    resend.emails.send({ from: FROM_EMAIL, to: String(to), subject, html: bodyHtml, text: bodyText }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout email")), 8000)),
  ]);
  if (result?.error) throw new Error(result.error.message);
  return { stato: "sent", messageId: result?.data?.id ?? null };
}
export async function inviaConfermaRecesso(richiestaId) {
  const { db, richiesta, righe } = await carica(richiestaId);
  if (!richiesta.cliente_email || richiesta.conferma_esito === "inviata") return { stato: "skipped" };
  try {
    const result = await send(
      richiesta.cliente_email,
      "Ricevuta richiesta di recesso " + richiesta.numero + " — InCittà",
      html(richiesta, righe),
      "Richiesta di recesso " + richiesta.numero + "\nRicezione: " + dataIT(richiesta.ricevuta_at) +
        "\nImporto previsto: €" + euro(richiesta.importo_previsto) + "\n" + richiesta.dichiarazione_testo
    );
    if (result.stato === "sent") {
      await db.from("richieste_recesso").update({
        conferma_inviata_at: new Date().toISOString(),
        conferma_email: String(richiesta.cliente_email),
        conferma_message_id: result.messageId,
        conferma_esito: "inviata",
        updated_at: new Date().toISOString(),
      }).eq("id", richiestaId);
      if (richiesta.venditore_email) {
        try {
          await send(
            richiesta.venditore_email,
            "Nuova richiesta di recesso " + richiesta.numero + " — InCittà",
            "<p>Nuova richiesta di recesso <strong>" + esc(richiesta.numero) + "</strong>.</p><p>Cliente: " + esc(richiesta.cliente_nome) + "</p>",
            "Nuova richiesta di recesso " + richiesta.numero
          );
        } catch (e) {
          console.error("[recesso-email] notifica venditore:", e instanceof Error ? e.message : e);
        }
      }
    }
    return result;
  } catch (e) {
    await db.from("richieste_recesso").update({
      conferma_esito: "fallita",
      updated_at: new Date().toISOString(),
    }).eq("id", richiestaId);
    console.error("[recesso-email] conferma:", e instanceof Error ? e.message : e);
    return { stato: "error" };
  }
}
export async function inviaAggiornamentoRecesso(richiestaId, nota = null) {
  const { richiesta, righe } = await carica(richiestaId);
  if (!richiesta.cliente_email) return { stato: "skipped" };
  try {
    return await send(
      richiesta.cliente_email,
      label(richiesta.stato) + " — pratica " + richiesta.numero,
      html(richiesta, righe, nota),
      "Pratica " + richiesta.numero + " — " + label(richiesta.stato) + "\n" + (nota || "La pratica è stata aggiornata dal venditore.")
    );
  } catch (e) {
    console.error("[recesso-email] aggiornamento:", e instanceof Error ? e.message : e);
    return { stato: "error" };
  }
}
