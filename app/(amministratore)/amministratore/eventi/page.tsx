import EventiModule from "@/components/amministratore/EventiModule";
import { getEventiAdmin } from "@/lib/eventi";

export const metadata = {
  title: "Eventi — Amministratore",
};

// I dati reali degli eventi devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function EventiPage() {
  const eventi = await getEventiAdmin();
  return <EventiModule eventi={eventi} />;
}