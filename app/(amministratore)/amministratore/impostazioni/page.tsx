import ImpostazioniModule, {
  type ImpostazioneEditoriale,
} from "@/components/amministratore/ImpostazioniModule";
import {
  CHIAVI_SALVABILI,
  getImpostazioniAdmin,
} from "@/lib/platform/settings";

export const metadata = {
  title: "Impostazioni piattaforma — Amministratore",
};

// Le impostazioni devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  const tutte = await getImpostazioniAdmin();

  // Espone solo le chiavi della whitelist (config pubblica del sito).
  const modificabili: ImpostazioneEditoriale[] = tutte
    .filter((impostazione) => impostazione.chiave in CHIAVI_SALVABILI)
    .map((impostazione) => ({
      chiave: impostazione.chiave,
      valore: impostazione.valore ?? "",
      descrizione: impostazione.descrizione ?? "",
      etichetta:
        CHIAVI_SALVABILI[impostazione.chiave as keyof typeof CHIAVI_SALVABILI] ??
        impostazione.chiave,
    }));

  return <ImpostazioniModule iniziali={modificabili} />;
}