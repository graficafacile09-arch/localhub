import UtentiModule from "@/components/amministratore/UtentiModule";
import { getConteggiUtenti, getUtenti } from "@/lib/amministratore/service";

export const metadata = {
  title: "Utenti — Amministratore",
};

export default async function UtentiPage() {
  const [utenti, conteggi] = await Promise.all([
    getUtenti("tutti"),
    getConteggiUtenti(),
  ]);

  return <UtentiModule utenti={utenti} conteggi={conteggi} />;
}
