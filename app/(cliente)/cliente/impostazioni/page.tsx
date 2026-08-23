import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Impostazioni — LocalHub",
};

/**
 * Le Impostazioni dell'Area Clienti sono state FUSE nel Profilo
 * (/cliente/profilo): dati personali, indirizzo, avatar e cambio password
 * vivono ora in un'unica pagina. Redirect permanente per non spezzare
 * vecchi link e segnalibri.
 */
export default function ImpostazioniLegacyPage() {
  permanentRedirect("/cliente/profilo");
}
