import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Preferiti — LocalHub",
};

/**
 * Pagina legacy: i Preferiti vivono nell'Area Clienti (/cliente/preferiti).
 * Redirect permanente per non spezzare vecchi link e segnalibri.
 */
export default function PreferitiLegacyPage() {
  permanentRedirect("/cliente/preferiti");
}
