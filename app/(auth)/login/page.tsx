import { redirect } from "next/navigation";
import AuthCard from "@/components/auth/AuthCard";
import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/merchant");
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <AuthCard
        title="Accedi al pannello negoziante"
        description="Gestisci i negozi, prepara il catalogo e attiva il percorso verso Pubblica con AI."
      >
        <LoginForm error={error} authConfigured={isSupabaseConfigured()} />
      </AuthCard>
    </main>
  );
}
