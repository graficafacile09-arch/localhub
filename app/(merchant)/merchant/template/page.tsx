import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import TemplateManagerPage from "@/components/merchant/template/TemplateManagerPage";

export default async function TemplatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <TemplateManagerPage />
    </div>
  );
}
