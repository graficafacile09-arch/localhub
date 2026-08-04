import TemplateManagerPage from "@/components/amministratore/TemplateManagerPage";

export const metadata = {
  title: "Template — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Template di PIATTAFORMA — funzione di amministrazione.
 * L'amministratore crea, modifica ed elimina i template; i commercianti
 * possono solo sceglierli durante la creazione del negozio.
 */
export default function TemplatePage() {
  return (
    <TemplateManagerPage />
  );
}
