import SegnalazioniClienteModule from "@/components/cliente/segnalazioni/SegnalazioniClienteModule";

export const metadata = {
  title: "Invia una segnalazione — Area consumatori",
};

export default function SegnalazioniClientePage() {
  return (
    <section className="space-y-5" aria-label="Segnalazioni Area consumatori">
      <SegnalazioniClienteModule />
    </section>
  );
}