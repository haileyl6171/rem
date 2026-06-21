"use client";

import { useState, useEffect, useRef } from "react";

interface LoadingScreenProps {
  description?: string;
  onComplete: () => void;
}

const PHASES = [
  "dreaming up alternate viewing dimensions...",
  "mapping structural coordinates from imagery...",
  "weaving 3d gaussian splat boundaries...",
  "calibrating spatial light fields...",
  "finalising memory reconstruction...",
] as const;

const PHASE_DURATION_MS = 1000;

export default function LoadingScreen({
  description,
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
        setTimeout(() => onCompleteRef.current(), 250);
      }
    };

    const intervalId = setInterval(tick, PHASE_DURATION_MS);
    return () => clearInterval(intervalId);
  }, []);

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

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-6 select-none font-[family-name:var(--font-space-grotesk)] bg-[#0A0A0A]">
      <h1 className="text-5xl font-light tracking-widest text-[#E0E0E0] mb-20">
        Rem
      </h1>

      <div className="w-full max-w-md flex flex-col gap-12">
        <div className="min-h-10 flex items-center justify-center text-center">
          <p
            key={safeIndex}
            className="font-[family-name:var(--font-space-mono)] text-[11px] tracking-[0.2em] text-[#666666] uppercase animate-fade-in"
          >
            {PHASES[safeIndex]}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="h-[1px] w-full bg-[#222222] overflow-hidden rounded-full">
            <div
              className="h-full bg-white transition-all duration-300 ease-linear"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="font-[family-name:var(--font-space-mono)] text-[9px] tracking-[0.3em] text-[#444444] uppercase">
              Processing
            </span>
            <span className="font-[family-name:var(--font-space-mono)] text-[10px] tabular-nums text-[#666666] tracking-widest">
              {displayProgress}%
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {PHASES.map((_, i) => (
            <div
              key={i}
              className={[
                "h-[1px] flex-1 rounded-full transition-all duration-700",
                i < phaseIndex
                  ? "bg-white"
                  : i === phaseIndex
                  ? "bg-[#888888]"
                  : "bg-[#222222]",
              ].join(" ")}
            />
          ))}
        </div>

        {description && (
          <div className="mt-4 text-center">
            <p className="text-sm text-[#666666] italic leading-relaxed line-clamp-2">
              &quot;{description}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
