import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Ordini — LocalHub",
};

/**
 * Pagina legacy: gli Ordini vivono nell'Area Clienti (/cliente/ordini).
 * Redirect permanente per non spezzare vecchi link e segnalibri.
 */
export default function OrdiniLegacyPage() {
  permanentRedirect("/cliente/ordini");
}
