import RegistroAttivitaModule from "@/components/amministratore/RegistroAttivitaModule";

export const metadata = {
  title: "Registro attività — Amministratore",
};

export default function RegistroAttivitaPage() {
  return (
    <section className="space-y-5" aria-label="Registro attività Amministrazione">
      <RegistroAttivitaModule />
    </section>
  );
}