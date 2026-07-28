import { Building2, Clock, ImageIcon, MessageCircle, Settings } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import StoreInfoForm from "@/components/merchant/settings/StoreInfoForm";
import OpeningHoursEditor from "@/components/merchant/settings/OpeningHoursEditor";
import SocialContactsForm from "@/components/merchant/settings/SocialContactsForm";
import StoreGallery from "@/components/merchant/settings/StoreGallery";
import SettingsShell from "@/components/merchant/settings/SettingsShell";
import { requireCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

type DaySchedule = { apertura: string; chiusura: string; chiuso: boolean };

const DEFAULT_HOURS: Record<string, DaySchedule> = {
  "lunedì":    { apertura: "", chiusura: "", chiuso: false },
  "martedì":   { apertura: "", chiusura: "", chiuso: false },
  "mercoledì": { apertura: "", chiusura: "", chiuso: false },
  "giovedì":   { apertura: "", chiusura: "", chiuso: false },
  "venerdì":   { apertura: "", chiusura: "", chiuso: false },
  "sabato":    { apertura: "", chiusura: "", chiuso: false },
  "domenica":  { apertura: "", chiusura: "", chiuso: true },
};

type StoreRow = {
  id: string;
  nome: string | null;
  descrizione: string | null;
  categoria: string | null;
  attivo: boolean | null;
  indirizzo: string | null;
  telefono: string | null;
  email_negozio: string | null;
  sito_web: string | null;
  logo_url: string | null;
  banner_url: string | null;
  orari_apertura: Record<string, DaySchedule> | null;
  contatti_social: { whatsapp?: string; facebook?: string; instagram?: string; tiktok?: string } | null;
  galleria: string[] | null;
};

export default async function MerchantSettingsPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Completa la migrazione SQL prima di usare le impostazioni."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso alle impostazioni di questo negozio."
      />
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from("negozi")
    .select("id, nome, descrizione, categoria, attivo, indirizzo, telefono, email_negozio, sito_web, logo_url, banner_url, orari_apertura, contatti_social, galleria")
    .eq("id", negozioId)
    .single();

  const store = row as StoreRow | null;

  if (!store) {
    return (
      <MerchantEmptyState
        title="Errore di caricamento"
        description="Impossibile caricare i dati del negozio."
      />
    );
  }

  const infoInitial = {
    nome: store.nome ?? "",
    descrizione: store.descrizione ?? "",
    categoria: store.categoria ?? "",
    indirizzo: store.indirizzo ?? "",
    telefono: store.telefono ?? "",
    email_negozio: store.email_negozio ?? "",
    sito_web: store.sito_web ?? "",
    logo_url: store.logo_url ?? "",
    banner_url: store.banner_url ?? "",
  };

  const hoursInitial: Record<string, DaySchedule> = store.orari_apertura ?? DEFAULT_HOURS;
  const socialInitial = {
    whatsapp: store.contatti_social?.whatsapp ?? "",
    facebook: store.contatti_social?.facebook ?? "",
    instagram: store.contatti_social?.instagram ?? "",
    tiktok: store.contatti_social?.tiktok ?? "",
  };
  const galleryInitial: string[] = Array.isArray(store.galleria) ? store.galleria : [];

  return (
    <SettingsShell>
      <div className="space-y-6">

        {/* Header */}
        <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Impostazioni negozio
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {store.nome ?? "Negozio"}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-slate-500">{store.categoria ?? "Categoria non definita"}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${store.attivo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${store.attivo ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {store.attivo ? "Attivo" : "Non attivo"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 1. Informazioni negozio */}
        <Section id="informazioni" icon={<Building2 className="h-4 w-4" />} title="Informazioni negozio" subtitle="Dati generali, contatti, logo e banner">
          <StoreInfoForm storeId={negozioId} initial={infoInitial} />
        </Section>

        {/* 2. Orari di apertura */}
        <Section id="orari" icon={<Clock className="h-4 w-4" />} title="Orari di apertura" subtitle="Configura gli orari settimanali del negozio">
          <OpeningHoursEditor storeId={negozioId} initial={hoursInitial} />
        </Section>

        {/* 3. Contatti e Social */}
        <Section id="social" icon={<MessageCircle className="h-4 w-4" />} title="Contatti e Social" subtitle="Collega i tuoi profili social e WhatsApp">
          <SocialContactsForm storeId={negozioId} initial={socialInitial} />
        </Section>

        {/* 4. Galleria negozio */}
        <Section id="galleria" icon={<ImageIcon className="h-4 w-4" />} title="Galleria negozio" subtitle="Carica foto della tua attività per attirare più clienti">
          <StoreGallery storeId={negozioId} initial={galleryInitial} />
        </Section>

      </div>
    </SettingsShell>
  );
}

function Section({
  icon,
  title,
  subtitle,
  id,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
