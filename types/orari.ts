export type DaySchedule = {
  chiuso: boolean;
  apertura1: string;
  chiusura1: string;
  apertura2: string;
  chiusura2: string;
};

export type Orari = Record<string, DaySchedule>;

export const DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
export const ITALIAN_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export const EMPTY_DAY: DaySchedule = {
  chiuso: false,
  apertura1: "",
  chiusura1: "",
  apertura2: "",
  chiusura2: "",
};

export const CLOSED_DAY: DaySchedule = {
  chiuso: true,
  apertura1: "",
  chiusura1: "",
  apertura2: "",
  chiusura2: "",
};

export const DEFAULT_HOURS: Orari = {
  lunedì: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  martedì: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  mercoledì: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  giovedì: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  venerdì: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  sabato: { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" },
  domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
};

export function parseTime(t: string): number {
  const parts = t.split(":").map(Number);
  return parts[0] * 60 + (parts[1] ?? 0);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
