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

const PHASE_DURATION_MS = 3500;

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
        setTimeout(() => onCompleteRef.current(), 600);
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
    <div className="h-full w-full flex flex-col items-center justify-center px-6 select-none">
      {/* Logo */}
      <h1 className="text-4xl font-extralight tracking-[0.3em] text-neutral-100 lowercase mb-16">
        ovlt
      </h1>

      <div className="w-full max-w-md flex flex-col gap-10">
        {/* Current phase label */}
        <div className="min-h-10 flex items-center">
          <p
            key={safeIndex}
            className="text-sm tracking-widest text-neutral-400 lowercase animate-fade-in"
          >
            {PHASES[safeIndex]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-3">
          <div className="h-px w-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-neutral-400 transition-all duration-300 ease-linear"
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs tracking-widest text-neutral-700 lowercase">
              processing
            </span>
            <span className="text-xs tabular-nums text-neutral-600">
              {displayProgress}%
            </span>
          </div>
        </div>

        {/* Animated step indicators */}
        <div className="flex gap-3">
          {PHASES.map((_, i) => (
            <div
              key={i}
              className={[
                "h-px flex-1 transition-all duration-700",
                i < phaseIndex
                  ? "bg-neutral-400"
                  : i === phaseIndex
                  ? "bg-neutral-600"
                  : "bg-neutral-800",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Optional description echo */}
        {description && (
          <p className="text-xs text-neutral-700 italic leading-relaxed line-clamp-2">
            &quot;{description}&quot;
          </p>
        )}
      </div>

      {/* Animated orb */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
        <div className="w-96 h-96 rounded-full bg-neutral-900/60 blur-3xl animate-pulse" />
      </div>
    </div>
  );
}
