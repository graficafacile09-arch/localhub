import ContenutiModule from "@/components/amministratore/ContenutiModule";

export const metadata = {
  title: "Contenuti — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Contenuti editoriali nell'Area Amministratore: creazione, modifica,
 * pubblicazione e archiviazione degli articoli del portale. L'accesso è
 * garantito dal layout amministratore (area "admin" risolta server-side) e
 * ogni mutazione passa dalle API guardate (requireApiArea("admin")) con
 * registrazione in admin_activity_log.
 */
export default function AdminContenutiPage() {
  return <ContenutiModule />;
}