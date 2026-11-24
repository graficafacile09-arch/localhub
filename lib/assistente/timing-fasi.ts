// Diagnostica temporanea (timeout Preview): registra solo etichetta, durata ed esito.
// Nessun prompt, risposta, query o dato personale viene letto o stampato.
export async function misuraFaseChat<T>(
  etichetta: string,
  operazione: () => Promise<T>
): Promise<T> {
  const inizio = Date.now();
  try {
    const risultato = await operazione();
    console.info("[probe-fase]", etichetta, "ms=" + (Date.now() - inizio), "esito=ok");
    return risultato;
  } catch (errore) {
    const nome = errore instanceof Error ? errore.name : "non_errore";
    console.info("[probe-fase]", etichetta, "ms=" + (Date.now() - inizio), "esito=errore", nome);
    throw errore;
  }
}
