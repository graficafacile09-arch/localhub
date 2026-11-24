// Strumentazione temporanea di diagnosi (timeout Vercel su pino-capacita-sicurezza).
// Registra solo etichetta fissa, durata ed esito: nessun input, output, URL o header.

export async function misura<T>(etichetta: string, operazione: () => Promise<T>): Promise<T> {
  const inizio = Date.now();
  console.info("[probe]", etichetta, "start", `t=${inizio}`);
  try {
    const risultato = await operazione();
    console.info("[probe]", etichetta, "end", `ms=${Date.now() - inizio}`, "esito=ok");
    return risultato;
  } catch (errore) {
    const nome = errore instanceof Error ? errore.name : "non-Error";
    console.info("[probe]", etichetta, "end", `ms=${Date.now() - inizio}`, "esito=errore", `tipo=${nome}`);
    throw errore;
  }
}

/** Nome host di un URL, senza path, query o credenziali. */
export function hostDi(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "url-non-valido";
  }
}
