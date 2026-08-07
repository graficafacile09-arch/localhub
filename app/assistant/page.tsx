import BackButton from "@/components/BackButton";

export const metadata = {
  title: "Assistente AI — InCittà",
};

export default function AssistantPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <BackButton label="Torna indietro" className="px-6 py-2.5 text-sm" />
    </main>
  );
}