import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Profilo — LocalHub",
};

/**
 * Pagina legacy: il Profilo vive nell'Area Clienti (/cliente/profilo).
 * Redirect permanente per non spezzare vecchi link e segnalibri.
 */
export default function ProfiloLegacyPage() {
  permanentRedirect("/cliente/profilo");
}
