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

  // Fine-grained smooth progress within each phase
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
    <div className="h-full w-full flex flex-col items-center justify-center px-4 sm:px-6 select-none font-sans bg-[#F7F5F0]">
      {/* Logo */}
      <h1 className="text-4xl sm:text-5xl font-serif text-[#4A3320] mb-12 sm:mb-20">
        Rem
      </h1>

      <div className="w-full max-w-md flex flex-col gap-8 sm:gap-12">
        {/* Current phase label */}
        <div className="min-h-10 flex items-center justify-center text-center">
          <p
            key={safeIndex}
            className="text-[11px] tracking-[0.2em] text-[#7A6B63] uppercase animate-fade-in"
          >
            {PHASES[safeIndex]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-4">
          <div className="h-[1px] w-full bg-[#E2DCD0] overflow-hidden">
            <div
              className="h-full bg-[#C86B3C] transition-all duration-300 ease-linear"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] tracking-[0.3em] text-[#B5AD9F] uppercase">
              Processing
            </span>
            <span className="text-[10px] tabular-nums text-[#7A6B63] tracking-widest">
              {displayProgress}%
            </span>
          </div>
        </div>

        {/* Animated step indicators */}
        <div className="flex gap-2">
          {PHASES.map((_, i) => (
            <div
              key={i}
              className={[
                "h-[1px] flex-1 transition-all duration-700",
                i < phaseIndex
                  ? "bg-[#C86B3C]"
                  : i === phaseIndex
                  ? "bg-[#4A3320]"
                  : "bg-[#E2DCD0]",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Optional description echo */}
        {description && (
          <div className="mt-4 text-center">
            <p className="text-sm font-serif text-[#7A6B63] italic leading-relaxed line-clamp-2">
              &quot;{description}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}