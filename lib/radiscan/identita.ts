/**
 * RadiciScan — identificativo di rete per la quota anonima.
 *
 * Modello di fiducia esplicito:
 *   1. su Vercel (`VERCEL === "1"`) si usano solo gli header che la
 *      piattaforma sovrascrive: `x-vercel-forwarded-for`, poi
 *      `x-forwarded-for`. `x-real-ip` è ignorato: fuori da Vercel è un header
 *      arbitrario del client;
 *   2. fuori da Vercel serve `RADISCAN_TRUSTED_PROXY=1`, cioè la dichiarazione
 *      esplicita che un proxy controllato aggiunge/sanifica
 *      `x-forwarded-for`. In sua assenza non si accetta alcun header e la
 *      route fallisce chiusa (503): meglio negare l'analisi che applicare una
 *      quota aggirabile.
 *
 * L'indirizzo viene normalizzato in forma canonica prima dell'hash: minuscole,
 * niente zone IPv6, IPv4-mapped convertiti in IPv4, IPv6 espanso senza zeri
 * iniziali. Così forme testuali diverse dello stesso indirizzo non creano
 * chiavi di quota distinte.
 */

const RE_IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function ipv4Valido(valore: string): boolean {
  return RE_IPV4.test(valore);
}

/** Espande un IPv6 in 8 gruppi, gestendo la compressione `::`. */
function espandiIpv6(valore: string): string[] | null {
  const parti = valore.split("::");
  if (parti.length > 2) return null;

  const testa = parti[0] ? parti[0].split(":") : [];
  const coda = parti.length === 2 && parti[1] ? parti[1].split(":") : [];

  if (parti.length === 1) {
    return testa.length === 8 ? testa : null;
  }

  const mancanti = 8 - testa.length - coda.length;
  if (mancanti < 1) return null;
  return [...testa, ...Array<string>(mancanti).fill("0"), ...coda];
}

/** Forma canonica: 8 gruppi esadecimali minuscoli, senza zeri iniziali. */
function formaCanonicaIpv6(valore: string): string | null {
  const gruppi = espandiIpv6(valore);
  if (!gruppi) return null;

  const normalizzati: string[] = [];
  for (const gruppo of gruppi) {
    if (!/^[0-9a-f]{1,4}$/.test(gruppo)) return null;
    normalizzati.push(parseInt(gruppo, 16).toString(16));
  }
  return normalizzati.join(":");
}

/**
 * Normalizza un indirizzo IP. Restituisce `null` se non è un IPv4 o IPv6
 * valido. Non esegue risoluzioni DNS.
 */
export function normalizzaIp(valore: string | null | undefined): string | null {
  if (typeof valore !== "string") return null;

  let ip = valore.trim().toLowerCase();
  if (!ip) return null;
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);

  // Zona IPv6 (es. fe80::1%eth0): non fa parte dell'indirizzo.
  const senzaZona = ip.split("%")[0];
  if (!senzaZona) return null;

  const mappato = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(senzaZona);
  if (mappato && ipv4Valido(mappato[1])) return mappato[1];

  if (ipv4Valido(senzaZona)) return senzaZona;
  return formaCanonicaIpv6(senzaZona);
}

export function ipValido(valore: string): boolean {
  return normalizzaIp(valore) !== null;
}

function primoIndirizzo(header: string | null): string | null {
  if (!header) return null;
  for (const voce of header.split(",")) {
    const normalizzato = normalizzaIp(voce);
    if (normalizzato) return normalizzato;
  }
  return null;
}

function ultimoIndirizzo(header: string | null): string | null {
  if (!header) return null;
  const voci = header
    .split(",")
    .map((voce) => voce.trim())
    .filter(Boolean);
  const ultima = voci[voci.length - 1];
  return ultima ? normalizzaIp(ultima) : null;
}

export function ipAttendibile(request: Request): string | null {
  if (process.env.VERCEL === "1") {
    // Header impostati e sovrascritti da Vercel: il client non può sceglierli.
    return (
      primoIndirizzo(request.headers.get("x-vercel-forwarded-for")) ??
      primoIndirizzo(request.headers.get("x-forwarded-for"))
    );
  }

  if (process.env.RADISCAN_TRUSTED_PROXY === "1") {
    // Proxy controllato: l'ultima voce è quella aggiunta dal proxy stesso.
    return ultimoIndirizzo(request.headers.get("x-forwarded-for"));
  }

  return null;
}
