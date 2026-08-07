import SegnalazioniModule from "@/components/amministratore/SegnalazioniModule";

export const metadata = {
  title: "Segnalazioni — Amministratore",
};

export default function SegnalazioniPage() {
  return (
    <section className="space-y-5" aria-label="Segnalazioni Amministrazione">
      <SegnalazioniModule />
    </section>
  );
}