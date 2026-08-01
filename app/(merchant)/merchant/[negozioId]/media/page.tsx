import { getCurrentUser } from "@/lib/auth/session";
import { canManageStore } from "@/lib/merchant/data";
import { redirect } from "next/navigation";
import MediaManagerPage from "@/components/merchant/media/MediaManagerPage";

type Props = {
  params: Promise<{ negozioId: string }>;
};

export default async function MediaPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { negozioId } = await params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) redirect("/merchant");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <MediaManagerPage storeId={negozioId} />
    </div>
  );
}
