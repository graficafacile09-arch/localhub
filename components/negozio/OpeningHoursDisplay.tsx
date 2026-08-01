import type { Orari } from "@/types/orari";

const DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

type Props = {
  orari: Orari | Record<string, { chiuso: boolean; apertura1: string; chiusura1: string; apertura2: string; chiusura2: string }>;
};

export default function OpeningHoursDisplay({ orari }: Props) {
  if (!orari || typeof orari !== "object") return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">Orari</p>
      <div className="space-y-1">
        {DAYS.map((day) => {
          const d = orari[day];
          if (!d) return null;
          const label = d.chiuso ? "Chiuso" : [d.apertura1 && d.chiusura1 ? `${d.apertura1}–${d.chiusura1}` : "", d.apertura2 && d.chiusura2 ? `${d.apertura2}–${d.chiusura2}` : ""].filter(Boolean).join(", ");
          return (
            <div key={day} className="flex justify-between text-[11px]">
              <span className="font-medium capitalize text-slate-600">{day}</span>
              <span className={d.chiuso ? "text-red-400" : "text-slate-500"}>{label || "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
