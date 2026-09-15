const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
// non serve: simuliamo con tsx per import TS puro
EOF
npx tsx -e '
import { generaSlotDisponibili } from "./lib/prenotazioni-slot";
import type { Orari } from "./types/negozio";

const orari = {
  "lunedì": { chiuso: false, apertura1: "09:00", chiusura1: "20:00", apertura2: "15:00", chiusura2: "19:00" },
} as unknown as Orari;

const daySchedule = orari["lunedì"];
const config = { attiva: true, anticipo_min_ore: 0, anticipo_max_giorni: 30, buffer_min: 0, limite_giornaliero: null, passo_slot_min: 15 };
const slot = generaSlotDisponibili({ giorno: "2026-09-07", daySchedule, durataMin: 28, prenotazioni: [], config, now: new Date("2026-09-01T08:00:00Z") });
const inizio = slot.map(s => s.oraInizio);
const duplicati = inizio.filter((v, i) => inizio.indexOf(v) !== i);
console.log("slot totali:", slot.length);
console.log("slot unici:", new Set(inizio).size);
console.log("DUPLICATI:", duplicati.length > 0 ? duplicati : "nessuno");
' 2>&1 | head -15; rm -f .probe-dup.cjs
