import AdminDashboard from "@/components/amministratore/AdminDashboard";
import { getConteggiDashboard } from "@/lib/amministratore/data";

export const metadata = {
  title: "Panoramica — Amministratore",
};

// La dashboard deve riflettere in tempo reale i dati del database,
// quindi non viene prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

export default async function PanoramicaPage() {
  const stats = await getConteggiDashboard();

  return <AdminDashboard stats={stats} />;
}
