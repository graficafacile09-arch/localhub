// Negozi e prodotti di prova/dimostrativi: restano nel database ma non devono
// comparire nella vetrina pubblica né nella sitemap.
const PATTERN_DEMO_PUBBLICO = /demo|dimostrativ|vaso-indiano|tappeto-indiano/i;

export function isDemoPubblico(riga: { slug?: unknown; nome?: unknown }): boolean {
  return PATTERN_DEMO_PUBBLICO.test(`${riga.slug ?? ""} ${riga.nome ?? ""}`);
}
