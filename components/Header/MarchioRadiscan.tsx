/**
 * Marchio Radiscan — l'asset allegato ricostruito in vettoriale.
 *
 * Il marchio è un riquadro aperto (quattro angoli arrotondati) che racchiude
 * i prodotti: pomodoro, formaggio, salume e vino. È disegnato a tratto, in
 * `currentColor`, con la stessa grammatica delle icone del sito (niente
 * riempimenti, niente ombre): così nella pillola di navigazione resta verde
 * bosco a riposo e diventa avorio sulla pillola attiva, esattamente come le
 * altre icone.
 *
 * I quattro prodotti sono semplificati all'osso: alla misura della pillola
 * (20–26 px) il dettaglio fine diventa polvere, quindi restano solo le
 * sagome riconoscibili, con molto respiro dentro il riquadro.
 */
export default function MarchioRadiscan({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Riquadro aperto: quattro angoli, come nel marchio allegato. */}
      <g strokeWidth={1.35}>
        <path d="M2.1 8.3V4.5a2.4 2.4 0 0 1 2.4-2.4h3.8" />
        <path d="M15.7 2.1h3.8a2.4 2.4 0 0 1 2.4 2.4v3.8" />
        <path d="M21.9 15.7v3.8a2.4 2.4 0 0 1-2.4 2.4h-3.8" />
        <path d="M8.3 21.9H4.5a2.4 2.4 0 0 1-2.4-2.4v-3.8" />
      </g>

      {/* Pomodoro, in alto a sinistra: frutto tondo con gambo e fogliolina. */}
      <circle cx="7.3" cy="9.1" r="2.45" />
      <path d="M7.3 6.65c0-.6.3-1.1.75-1.4" />
      <path d="M8.05 5.4c.7-.45 1.45-.35 1.85.15-.65.5-1.4.45-1.85-.15z" />

      {/* Formaggio, in alto a destra: cuneo con la crosta a destra. */}
      <path d="M13.4 11.05h5.8V8.5a.75.75 0 0 0-1.2-.6z" />
      <circle cx="17.4" cy="9.6" r="0.5" strokeWidth={0.9} />
      <circle cx="15.6" cy="10.35" r="0.35" strokeWidth={0.8} />

      {/* Salume, in basso a sinistra: salsiccia allungata in diagonale,
          legata all'estremità. */}
      <rect
        x="4.3"
        y="16.05"
        width="6.3"
        height="2.3"
        rx="1.15"
        transform="rotate(-20 7.45 17.2)"
      />
      <path d="M9.5 15.6l.55 1.5" strokeWidth={1.05} />

      {/* Vino, in basso a destra: calice a punta, gambo e base. */}
      <path d="M15.3 12.9h3.6v1.5a1.8 1.8 0 0 1-3.6 0z" />
      <path d="M17.1 16.2v2.6" />
      <path d="M16 19.6h2.2" />
    </svg>
  );
}
