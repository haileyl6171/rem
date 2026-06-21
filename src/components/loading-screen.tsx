"use client";

import { useState, useEffect, useRef, useMemo } from "react";

interface LoadingScreenProps {
  description?: string;
  accent?: string;
  onComplete: () => void;
}

// Phase copy maps loosely to the real pipeline stages (generate → COLMAP →
// train → export) so the demo narrates something true.
const PHASES = [
  "dreaming up the scene...",
  "mapping structure from the frames...",
  "solving camera positions...",
  "training the gaussian field...",
  "settling the memory into place...",
] as const;

const PHASE_DURATION_MS = 1150;
const DEFAULT_ACCENT = "#5B89A6";

export default function LoadingScreen({
  description,
  accent = DEFAULT_ACCENT,
  onComplete,
}: LoadingScreenProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const total = PHASES.length;
    let current = 0;

    const tick = () => {
      current += 1;
      setPhaseIndex(current);
      setProgress(Math.round((current / total) * 100));
      if (current >= total) {
        setTimeout(() => onCompleteRef.current(), 350);
      }
    };

    const intervalId = setInterval(tick, PHASE_DURATION_MS);
    return () => clearInterval(intervalId);
  }, []);

  // Fine-grained smooth progress within each phase.
  useEffect(() => {
    const startAt = (phaseIndex / PHASES.length) * 100;
    const endAt = ((phaseIndex + 1) / PHASES.length) * 100;
    const step = (endAt - startAt) / (PHASE_DURATION_MS / 50);
    const id = setInterval(() => {
      setProgress((p) => {
        const next = p + step;
        return next >= endAt ? endAt : next;
      });
    }, 50);
    return () => clearInterval(id);
  }, [phaseIndex]);

  const safeIndex = Math.min(phaseIndex, PHASES.length - 1);
  const displayProgress = Math.min(Math.round(progress), 100);

  // A ring of orbiting particles that "materialize" as progress climbs.
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        delay: -(i / 18) * 7,
        radius: 54 + (i % 3) * 10,
        duration: 7 + (i % 4),
        size: 3 + (i % 3),
      })),
    [],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#EEF2F6] flex flex-col items-center justify-center px-6 select-none font-sans">
      {/* Cool ambient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 38%, rgba(143,182,206,0.22) 0%, rgba(238,242,246,0) 70%)",
        }}
      />

      {/* Wordmark */}
      <h1 className="font-serif text-4xl text-[#2A323B] mb-16 animate-fade-in-down">
        rem
      </h1>

      {/* Reconstruction visualizer */}
      <div
        className="relative mb-16 h-44 w-44"
        style={{ opacity: 0.35 + (displayProgress / 100) * 0.65 }}
      >
        {/* Breathing core */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-3 w-3 rounded-full animate-breathe"
            style={{
              backgroundColor: accent,
              boxShadow: `0 0 28px 6px ${accent}66`,
            }}
          />
        </div>

        {/* Concentric guide rings */}
        {[88, 132, 176].map((d, i) => (
          <div
            key={d}
            className="absolute left-1/2 top-1/2 rounded-full border"
            style={{
              width: d,
              height: d,
              marginLeft: -d / 2,
              marginTop: -d / 2,
              borderColor: `${accent}22`,
              animation: `breathe ${5 + i}s ease-in-out infinite`,
            }}
          />
        ))}

        {/* Orbiting particles */}
        <div className="absolute left-1/2 top-1/2 h-0 w-0">
          {particles.map((p, i) => (
            <span
              key={i}
              className="absolute block rounded-full animate-orbit"
              style={
                {
                  width: p.size,
                  height: p.size,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                  backgroundColor: accent,
                  boxShadow: `0 0 8px ${accent}aa`,
                  "--orbit-r": `${p.radius}px`,
                  "--orbit-d": `${p.duration}s`,
                  animationDelay: `${p.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-md flex flex-col gap-10">
        {/* Phase label */}
        <div className="min-h-6 flex items-center justify-center text-center">
          <p
            key={safeIndex}
            className="text-[11px] tracking-[0.22em] text-[#586571] lowercase animate-fade-in"
          >
            {PHASES[safeIndex]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-4">
          <div className="h-[2px] w-full rounded-full bg-[#D3DBE3] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-linear"
              style={{
                width: `${displayProgress}%`,
                backgroundColor: accent,
                boxShadow: `0 0 12px ${accent}aa`,
              }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] tracking-[0.3em] text-[#8A96A2] uppercase">
              Reconstructing
            </span>
            <span className="text-[10px] tabular-nums text-[#586571] tracking-widest">
              {displayProgress}%
            </span>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          {PHASES.map((_, i) => (
            <div
              key={i}
              className="h-[2px] flex-1 rounded-full transition-all duration-700"
              style={{
                backgroundColor:
                  i < phaseIndex
                    ? accent
                    : i === phaseIndex
                      ? "#2A323B"
                      : "#D3DBE3",
              }}
            />
          ))}
        </div>

        {/* Description echo */}
        {description && (
          <div className="mt-2 text-center">
            <p className="text-sm font-serif text-[#586571] italic leading-relaxed line-clamp-2">
              &quot;{description}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
