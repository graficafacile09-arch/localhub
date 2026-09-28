/**
 * Intenti locali che devono essere gestiti dall'Assistente Pino invece del
 * motore catalogo. File puro e condivisibile tra Server e Client Components.
 */

function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_METEO =
  /\b(meteo|previsioni|che tempo fa|com'e il tempo|come e il tempo|come sara il tempo|piove|piovera|temperatura|quanti gradi|gradi ci sono)\b/i;

const RE_FARMACIA =
  /\b(farmacia|farmacie)\b.{0,50}\b(aperta|aperte|aperto|aperti|adesso|ora|turno|turno oggi)\b|\b(di turno|farmacia di turno|farmacie di turno)\b/i;

const RE_SINTOMO =
  /\b(febbre|temperatura alta|mal di gola|raffreddore|influenza|tosse|mal di testa)\b/i;

export function isLocalAssistantQuery(query: string): boolean {
  const q = normalizza(query);
  if (!q) return false;
  return RE_METEO.test(q) || RE_FARMACIA.test(q) || RE_SINTOMO.test(q);
}

export function isWeatherQuery(query: string): boolean {
  return RE_METEO.test(normalizza(query));
}

export function isPharmacyQuery(query: string): boolean {
  const q = normalizza(query);
  return RE_FARMACIA.test(q) || RE_SINTOMO.test(q);
}
