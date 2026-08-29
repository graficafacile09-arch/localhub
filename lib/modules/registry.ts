import type { ModuloRegistro } from "@/types/negozio";

export type ModuleComponentProps = {
  storeId: string;
  /** Percorso base dell'editor: "/merchant" (venditore) o "/amministratore/negozi" (admin). */
  basePath?: string;
};

export type ModuleDefinition = {
  slug: string;
  nome: string;
  icona: string;
  componente: React.ComponentType<ModuleComponentProps>;
};

const MODULES = new Map<string, () => Promise<{ default: React.ComponentType<ModuleComponentProps> }>>();

function register(slug: string, loader: () => Promise<{ default: React.ComponentType<ModuleComponentProps> }>) {
  MODULES.set(slug, loader);
}

register("informazioni", () => import("@/components/merchant/modules/InformazioniModule"));
register("immagini", () => import("@/components/merchant/modules/ImmaginiModule"));
register("prodotti", () => import("@/components/merchant/modules/ProdottiModule"));
register("servizi", () => import("@/components/merchant/modules/ServiziModule"));
register("offerte", () => import("@/components/merchant/modules/OfferteModule"));
register("eventi", () => import("@/components/merchant/modules/EventiModule"));
register("contatti", () => import("@/components/merchant/modules/ContattiModule"));
register("posizione", () => import("@/components/merchant/modules/PosizioneModule"));
register("orari", () => import("@/components/merchant/modules/OrariModule"));
register("social", () => import("@/components/merchant/modules/SocialModule"));
register("seo", () => import("@/components/merchant/modules/SeoModule"));
register("ai", () => import("@/components/merchant/modules/AiModule"));
register("pagamenti", () => import("@/components/merchant/modules/PagamentiModule"));
register("impostazioni", () => import("@/components/merchant/modules/ImpostazioniModule"));
register("richiesta_info", () => import("@/components/merchant/modules/RichiestaInfoModule"));
register("prenotazioni", () => import("@/components/merchant/modules/PrenotazioniModule"));

export async function getModuleComponent(slug: string): Promise<React.ComponentType<ModuleComponentProps> | null> {
  const loader = MODULES.get(slug);
  if (!loader) return null;
  try {
    const mod = await loader();
    return mod.default;
  } catch (err) {
    console.error(`[registry] Failed to load module "${slug}":`, err);
    return null;
  }
}

export function getModuleSlugs(): string[] {
  return Array.from(MODULES.keys());
}

export function moduliDaRegistro(registro: ModuloRegistro[]): ModuleDefinition[] {
  const slugsDisponibili = getModuleSlugs();
  return registro
    .filter((m) => m.attivo && slugsDisponibili.includes(m.slug))
    .sort((a, b) => a.ordinamento - b.ordinamento)
    .map((m) => ({
      slug: m.slug,
      nome: m.nome,
      icona: m.icona,
      componente: null as unknown as React.ComponentType<ModuleComponentProps>,
    }));
}
