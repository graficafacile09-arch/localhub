/**
 * FASE 6g — TEST NOTIFICHE EMAIL PRENOTAZIONI.
 *
 * Test PURi del modulo `lib/negozio/prenotazione-email.ts`: il sender è
 * iniettato con uno stub (contatore) → NESSUNA chiamata a Resend/rete.
 * Copre enabled/disabled, errori, escaping HTML e la logica di retry
 * (idempotenza) sul decision-helper `notificaMerchantPrenotazione`.
 */
import { test, expect } from "@playwright/test";

import {
  buildPrenotazioneEmailHtml,
  inviaPrenotazioneEmail,
  notificaMerchantPrenotazione,
  type SenderPrenotazioneEmail,
  type DatiNotificaPrenotazione,
} from "../lib/negozio/prenotazione-email";

const DATI: DatiNotificaPrenotazione = {
  numero: "PR-000001",
  servizioNome: "Pulizia dentale",
  durataMin: 30,
  giorno: "2026-09-10",
  oraInizio: "09:30",
  oraFine: "10:00",
  clienteNome: "Mario",
  clienteCognome: "Rossi",
  clienteTelefono: "3331234567",
  clienteEmail: "mario@example.com",
  note: "Prima visita",
};

type SenderRisultato =
  | { data: { id: string } }
  | { error: { message: string } };

/** Stub sender con contatore; configurabile per successo/errore/sollevazione. */
function stubSender(mode: "ok" | "err" | "throw"): {
  sends: SenderPrenotazioneEmail;
  chiamate: () => number;
  penultimoHtml: () => string | null;
} {
  let chiamate = 0;
  let penultimoHtml: string | null = null;
  const sends: SenderPrenotazioneEmail = {
    send: async (payload) => {
      chiamate += 1;
      penultimoHtml = payload.html;
      if (mode === "throw") throw new Error("boom reti");
      if (mode === "err") {
        return { error: { message: "sconto non valido" } };
      }
      return { data: { id: `id-${chiamate}` } };
    },
  };
  return { sends, chiamate: () => chiamate, penultimoHtml: () => penultimoHtml };
}

/** Imposta in modo isolato le variabili d'ambiente rilevanti. */
function conEnv(values: Record<string, string | undefined>) {
  const original = new Map<string, string | undefined>();
  for (const k of Object.keys(values)) {
    original.set(k, process.env[k]);
  }
  for (const [k, v] of Object.keys(values).map((k) => [k, values[k]] as const)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of original) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

test.describe("FASE 6g — notifica email prenotazione (unità, niente rete)", () => {
  test("1. disabled → skipped, sender mai chiamato", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "false", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("ok");
    const res = await inviaPrenotazioneEmail("negozio@example.com", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("skipped");
    expect(chiamate()).toBe(0);
  });

  test("2a. enabled ma senza RESEND_API_KEY → skipped, sender mai chiamato", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: undefined });
    const { sends, chiamate } = stubSender("ok");
    const res = await inviaPrenotazioneEmail("negozio@example.com", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("skipped");
    expect(chiamate()).toBe(0);
  });

  test("2b. senza destinatario → skipped, sender mai chiamato", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("ok");
    const res = await inviaPrenotazioneEmail("", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("skipped");
    expect(chiamate()).toBe(0);
  });

  test("3. enabled + sender che funziona → sent, chiamato 1 volta", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("ok");
    const res = await inviaPrenotazioneEmail("negozio@example.com", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("sent");
    expect(chiamate()).toBe(1);
  });

  test("4. errore del sender → error, senza propagare e senza lancio", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("err");
    const res = await inviaPrenotazioneEmail("negozio@example.com", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("error");
    expect(chiamate()).toBe(1);
  });

  test("4b. sollevazione del sender → error, senza propagare", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("throw");
    const res = await inviaPrenotazioneEmail("negozio@example.com", "Studio", DATI, sends);
    restore();
    expect(res.stato).toBe("error");
    expect(chiamate()).toBe(1);
  });

  test("5. escaping HTML dei dati cliente", () => {
    const html = buildPrenotazioneEmailHtml("Studio & Benessere", {
      ...DATI,
      numero: "PR-0002",
      servizioNome: '<b onerror="x">Consulenza</b> <script>alert(1)</script>',
      clienteNome: "Mar'io",
      clienteCognome: '"Rossi"',
      note: "& <tag> nota",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;b onerror=&quot;x&quot;&gt;Consulenza&lt;/b&gt;");
    expect(html).toContain("Mar&#39;io");
    expect(html).toContain("&quot;Rossi&quot;");
    expect(html).toContain("&amp; &lt;tag&gt; nota");
  });

  test("6. retry stessa idempotencyKey → sender NON richiamato (contatore)", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("ok");

    // Prima POST: esito NUOVA prenotazione → sender chiamato.
    const res1 = await notificaMerchantPrenotazione({
      destinatario: "negozio@example.com",
      negozioNome: "Studio",
      esito: {
        giaEsistente: false,
        prenotazione: esitoSuccesso().prenotazione,
      },
      sender: sends,
    });
    expect(res1.stato).toBe("sent");
    expect(chiamate()).toBe(1);

    // Retry STESSA chiave: giaEsistente=true → sender NON chiamato.
    const res2 = await notificaMerchantPrenotazione({
      destinatario: "negozio@example.com",
      negozioNome: "Studio",
      esito: { giaEsistente: true, prenotazione: null },
      sender: sends,
    });
    restore();
    expect(res2.stato).toBe("skipped");
    expect(chiamate()).toBe(1); // non incrementato
  });

  test("6b. retry: il decision-helper non chiama il sender", async () => {
    const { sends, chiamate } = stubSender("ok");
    const res = await notificaMerchantPrenotazione({
      destinatario: "x@y.it",
      negozioNome: "Studio",
      esito: { giaEsistente: true },
      sender: sends,
    });
    expect(res.stato).toBe("skipped");
    expect(chiamate()).toBe(0);
  });

  test("7. errore del sender NON blocca: esito resta successo/confermata", async () => {
    const restore = conEnv({ PRENOTAZIONI_EMAIL_ENABLED: "true", RESEND_API_KEY: "key" });
    const { sends, chiamate } = stubSender("err");
    const res = await notificaMerchantPrenotazione({
      destinatario: "negozio@example.com",
      negozioNome: "Studio",
      esito: {
        giaEsistente: false,
        prenotazione: esitoSuccesso().prenotazione,
      },
      sender: sends,
    });
    restore();
    // La prenotazione resta confermata; solo notifica in error.
    expect(res.stato).toBe("error");
    expect(chiamate()).toBe(1);
    expect(esitoSuccesso().prenotazione?.stato).toBe("confermata");
  });
});

function esitoSuccesso(): { prenotazione: Record<string, unknown> } {
  return {
    prenotazione: {
      id: "aaa-bbb",
      numero: "PR-000001",
      negozioId: "n1",
      servizioId: "svc-1",
      servizioNome: "Pulizia dentale",
      durataMin: 30,
      giorno: "2026-09-10",
      oraInizio: "09:30:00",
      oraFine: "10:00:00",
      clienteNome: "Mario",
      clienteCognome: "Rossi",
      clienteTelefono: "3331234567",
      clienteEmail: "mario@example.com",
      note: "Prima visita",
      stato: "confermata",
    },
  };
}