"use client";

import { useState, useEffect, useRef } from "react";

type PinoState = "idle" | "searching" | "happy" | "sad";

interface PinoAssistantProps {
  state: PinoState;
  query: string;
}

export function PinoAssistant({ state, query }: PinoAssistantProps) {
  const [bubbleText, setBubbleText] = useState("");
  const [showBubble, setShowBubble] = useState(false);
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
    }

    const escapedQuery = query.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        "&": "&",
        "<": "<",
        ">": ">",
        '"': '"',
        "'": "'",
      };
      return map[c] || c;
    });

    switch (state) {
      case "searching":
        setBubbleText(`Sto cercando \u201c${escapedQuery}\u201d per te!`);
        setShowBubble(true);
        break;
      case "happy":
        setBubbleText(`Ho trovato qualcosa per \u201c${escapedQuery}\u201d!`);
        setShowBubble(true);
        bubbleTimeoutRef.current = setTimeout(() => setShowBubble(false), 4000);
        break;
      case "sad":
        setBubbleText(`Non ho trovato risultati per \u201c${escapedQuery}\u201d.`);
        setShowBubble(true);
        bubbleTimeoutRef.current = setTimeout(() => setShowBubble(false), 5000);
        break;
      default:
        setShowBubble(false);
    }

    return () => {
      if (bubbleTimeoutRef.current) {
        clearTimeout(bubbleTimeoutRef.current);
      }
    };
  }, [state, query]);

  const baseClasses = "relative w-full max-w-[180px] sm:max-w-[200px] md:max-w-[220px]";

  const stateClasses: Record<PinoState, string> = {
    idle: "opacity-100",
    searching: "opacity-100 animate-pino-searching",
    happy: "opacity-100 animate-pino-happy",
    sad: "opacity-100 animate-pino-sad",
  };

  return (
    <div className={`${baseClasses} ${stateClasses[state]}`} aria-hidden="true">
      <div className="relative" style={{ position: "relative" }}>
        <img
          src="/pino-master.png"
          alt=""
          className="w-full h-auto block"
          loading="lazy"
          style={{ display: "block", width: "100%", height: "auto" }}
        />

        <div className="absolute inset-0 pointer-events-none" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          {state === "searching" && <SearchingOverlay />}
          {state === "happy" && <HappyOverlay />}
          {state === "sad" && (
            <>
              <SadOverlay />
              <TearsOverlay />
            </>
          )}
        </div>
      </div>

      {showBubble && bubbleText && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[220px] px-3 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-white rounded-xl border border-slate-200 shadow-lg animate-pino-bubble-in"
          role="status"
          aria-live="polite"
          dangerouslySetInnerHTML={{ __html: bubbleText }}
        />
      )}

      <style jsx>{`
        @keyframes pino-searching {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(-1deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-2px) rotate(1deg); }
        }
        @keyframes pino-happy {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.02) rotate(1deg); }
        }
        @keyframes pino-sad {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        @keyframes pino-bubble-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.9); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .animate-pino-searching { animation: pino-searching 3s ease-in-out infinite; }
        .animate-pino-happy { animation: pino-happy 2s ease-in-out infinite; }
        .animate-pino-sad { animation: pino-sad 2.5s ease-in-out infinite; }
        .animate-pino-bubble-in { animation: pino-bubble-in 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}

function SearchingOverlay() {
  return (
    <>
      <style jsx>{`
        @keyframes pino-search-blink {
          0%, 85%, 100% { transform: scaleY(1); }
          92% { transform: scaleY(0.15); }
        }
        .search-eye { animation: pino-search-blink 4s ease-in-out infinite; }
        .search-pupil { animation: pino-search-blink 4s ease-in-out infinite; }
      `}</style>

      <div className="search-eye" style={{
        position: "absolute",
        top: "28%",
        left: "32%",
        width: "14%",
        height: "10%",
        borderRadius: "50%",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
      }}>
        <div className="search-pupil" style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "50%",
          height: "60%",
          borderRadius: "50%",
          background: "#fff",
          transform: "translate(-50%, -50%)",
          opacity: 0.9,
        }} />
      </div>
      <div className="search-eye" style={{
        position: "absolute",
        top: "28%",
        left: "58%",
        width: "14%",
        height: "10%",
        borderRadius: "50%",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
      }}>
        <div className="search-pupil" style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "50%",
          height: "60%",
          borderRadius: "50%",
          background: "#fff",
          transform: "translate(-50%, -50%)",
          opacity: 0.9,
        }} />
      </div>
      <div style={{
        position: "absolute",
        top: "48%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "20%",
        height: "4%",
        borderRadius: "2px",
        background: "#4a4a6a",
        opacity: 0.7,
      }} />
    </>
  );
}

function HappyOverlay() {
  return (
    <>
      <style jsx>{`
        @keyframes pino-happy-eye {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes pino-happy-cheek {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        .happy-eye { animation: pino-happy-eye 3s ease-in-out infinite; }
        .happy-cheek { animation: pino-happy-cheek 2.5s ease-in-out infinite; }
      `}</style>

      <div className="happy-eye" style={{
        position: "absolute",
        top: "28%",
        left: "32%",
        width: "16%",
        height: "12%",
        borderRadius: "50% 50% 0 0",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
        clipPath: "polygon(0 100%, 100% 100%, 100% 0, 0 0)",
      }}>
        <div style={{
          position: "absolute",
          bottom: "0",
          left: "50%",
          width: "40%",
          height: "60%",
          borderRadius: "50%",
          background: "#fff",
          transform: "translateX(-50%)",
          opacity: 0.9,
        }} />
      </div>
      <div className="happy-eye" style={{
        position: "absolute",
        top: "28%",
        left: "58%",
        width: "16%",
        height: "12%",
        borderRadius: "50% 50% 0 0",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
        clipPath: "polygon(0 100%, 100% 100%, 100% 0, 0 0)",
      }}>
        <div style={{
          position: "absolute",
          bottom: "0",
          left: "50%",
          width: "40%",
          height: "60%",
          borderRadius: "50%",
          background: "#fff",
          transform: "translateX(-50%)",
          opacity: 0.9,
        }} />
      </div>
      <div style={{
        position: "absolute",
        top: "42%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "35%",
        height: "10%",
        borderRadius: "0 0 50% 50%",
        background: "#2d7d2d",
        boxShadow: "0 2px 4px rgba(45,125,45,0.3)",
        zIndex: 10,
      }} />
      <div className="happy-cheek" style={{
        position: "absolute",
        top: "38%",
        left: "15%",
        width: "12%",
        height: "10%",
        borderRadius: "50%",
        background: "#ff6b9d",
        opacity: 0.5,
        zIndex: 5,
      }} />
      <div className="happy-cheek" style={{
        position: "absolute",
        top: "38%",
        right: "15%",
        width: "12%",
        height: "10%",
        borderRadius: "50%",
        background: "#ff6b9d",
        opacity: 0.5,
        zIndex: 5,
      }} />
    </>
  );
}

function SadOverlay() {
  return (
    <>
      <style jsx>{`
        @keyframes pino-sad-eye {
          0%, 100% { transform: translate(-50%, -50%) scaleY(1); }
          50% { transform: translate(-50%, -50%) scaleY(0.7); }
        }
        @keyframes pino-sad-tear-well {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.6; }
        }
        .sad-eye { animation: pino-sad-eye 4s ease-in-out infinite; }
        .sad-tear-well { animation: pino-sad-tear-well 3s ease-in-out infinite; }
      `}</style>

      <div className="sad-eye" style={{
        position: "absolute",
        top: "26%",
        left: "32%",
        width: "16%",
        height: "14%",
        borderRadius: "0 0 50% 50%",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
      }}>
        <div className="sad-tear-well" style={{
          position: "absolute",
          bottom: "5%",
          left: "50%",
          width: "30%",
          height: "30%",
          borderRadius: "50%",
          background: "#4a9eff",
          transform: "translateX(-50%)",
          opacity: 0.4,
        }} />
      </div>
      <div className="sad-eye" style={{
        position: "absolute",
        top: "26%",
        left: "58%",
        width: "16%",
        height: "14%",
        borderRadius: "0 0 50% 50%",
        background: "#1a1a2e",
        transformOrigin: "center",
        zIndex: 10,
      }}>
        <div className="sad-tear-well" style={{
          position: "absolute",
          bottom: "5%",
          left: "50%",
          width: "30%",
          height: "30%",
          borderRadius: "50%",
          background: "#4a9eff",
          transform: "translateX(-50%)",
          opacity: 0.4,
        }} />
      </div>
      <div style={{
        position: "absolute",
        top: "46%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "25%",
        height: "4%",
        borderRadius: "2px",
        background: "#2d2d4a",
        opacity: 0.6,
        zIndex: 10,
      }} />
      <div style={{
        position: "absolute",
        top: "36%",
        left: "12%",
        width: "14%",
        height: "10%",
        borderRadius: "50%",
        background: "#3a3a5a",
        opacity: 0.3,
        zIndex: 5,
      }} />
      <div style={{
        position: "absolute",
        top: "36%",
        right: "12%",
        width: "14%",
        height: "10%",
        borderRadius: "50%",
        background: "#3a3a5a",
        opacity: 0.3,
        zIndex: 5,
      }} />
    </>
  );
}

function TearsOverlay() {
  return (
    <>
      <style jsx>{`
        @keyframes pino-tear-fall-1 {
          0% { transform: translate(-50%, -5px) scale(1); opacity: 0; }
          10% { opacity: 1; }
          75% { transform: translate(-50%, 35px) scale(1); opacity: 1; }
          100% { transform: translate(-50%, 45px) scale(0.5); opacity: 0; }
        }
        @keyframes pino-tear-fall-2 {
          0% { transform: translate(-50%, -5px) scale(1); opacity: 0; }
          20% { opacity: 1; }
          85% { transform: translate(-50%, 35px) scale(1); opacity: 1; }
          100% { transform: translate(-50%, 45px) scale(0.5); opacity: 0; }
        }
        @keyframes pino-tear-fall-3 {
          0% { transform: translate(-50%, -5px) scale(1); opacity: 0; }
          30% { opacity: 1; }
          90% { transform: translate(-50%, 35px) scale(1); opacity: 1; }
          100% { transform: translate(-50%, 45px) scale(0.5); opacity: 0; }
        }
        @keyframes pino-tear-fall-4 {
          0% { transform: translate(-50%, -5px) scale(1); opacity: 0; }
          15% { opacity: 1; }
          80% { transform: translate(-50%, 35px) scale(1); opacity: 1; }
          100% { transform: translate(-50%, 45px) scale(0.5); opacity: 0; }
        }
        .tear { position: absolute; width: 6%; height: 10%; border-radius: 50% 50% 50% 0; background: linear-gradient(180deg, rgba(74,158,255,0.9) 0%, rgba(30,100,200,0.7) 100%); transform-origin: center bottom; z-index: 15; }
        .tear-1 { left: 28%; top: 38%; animation: pino-tear-fall-1 2.5s ease-in-out infinite; }
        .tear-2 { left: 42%; top: 36%; animation: pino-tear-fall-2 2.5s ease-in-out infinite 0.3s; }
        .tear-3 { left: 58%; top: 38%; animation: pino-tear-fall-3 2.5s ease-in-out infinite 0.6s; }
        .tear-4 { left: 72%; top: 36%; animation: pino-tear-fall-4 2.5s ease-in-out infinite 0.9s; }
      `}</style>

      <div className="tear tear-1" />
      <div className="tear tear-2" />
      <div className="tear tear-3" />
      <div className="tear tear-4" />
    </>
  );
}