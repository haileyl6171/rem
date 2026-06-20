"use client";

import { useEffect, useRef, useState } from "react";

interface MemoryViewerProps {
  onReturn: () => void;
}

const CONTROLS_MAP = [
  { key: "W / S", action: "move forward / back" },
  { key: "A / D", action: "strafe left / right" },
  { key: "Q / E", action: "move up / down" },
  { key: "mouse drag", action: "look around" },
  { key: "scroll", action: "zoom" },
] as const;

export default function MemoryViewer({ onReturn }: MemoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ dispose: () => void } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);

  useEffect(() => {
    // Guard: only run in browser
    if (typeof window === "undefined" || !containerRef.current) return;

    let disposed = false;

    const initViewer = async () => {
      try {
        // Dynamic import keeps the heavy WebGL library out of the SSR bundle
        const GaussianSplats3D = await import(
          "@mkkellogg/gaussian-splats-3d"
        );

        if (disposed || !containerRef.current) return;

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: containerRef.current,
          cameraUp: [0, -1, 0],
          initialCameraPosition: [0, 0, 4],
          selfRenderMode: true,
          gpuAcceleratedSort: true,
          sharedMemoryForWorkers: false,
        });

        viewerRef.current = viewer;

        await viewer.addSplatScene("/sample_memory.splat", {
          progressiveLoad: true,
        });

        if (!disposed) {
          viewer.start();
          setIsLoaded(true);
        }
      } catch (err) {
        if (!disposed) {
          console.error("[MemoryViewer] failed to initialise viewer:", err);
          setLoadError(
            err instanceof Error ? err.message : "failed to load 3d memory"
          );
        }
      }
    };

    initViewer();

    return () => {
      disposed = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch {
          // Silence errors during teardown
        }
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-neutral-950 overflow-hidden">
      {/* Three.js / WebGL canvas mount target */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading indicator (pre-scene) */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="w-6 h-6 rounded-full border border-neutral-700 border-t-neutral-400 animate-spin" />
            <span className="text-xs text-neutral-600 tracking-widest lowercase">
              loading splat...
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-xs text-red-500/70 tracking-wider lowercase text-center max-w-sm">
            {loadError}
          </p>
          <p className="text-xs text-neutral-700 tracking-widest lowercase">
            ensure <code className="text-neutral-600">sample_memory.splat</code>{" "}
            exists in <code className="text-neutral-600">/public</code>
          </p>
          <button
            onClick={onReturn}
            className="mt-2 text-xs tracking-[0.25em] lowercase text-neutral-400 hover:text-neutral-100 transition-colors"
          >
            ← return
          </button>
        </div>
      )}

      {/* HUD overlay */}
      {!loadError && (
        <div
          className={[
            "absolute inset-x-0 top-0 flex items-start justify-between p-6 pointer-events-none transition-opacity duration-500",
            hudVisible ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {/* Return button */}
          <button
            onClick={onReturn}
            className="pointer-events-auto flex items-center gap-2 bg-neutral-950/70 backdrop-blur-sm border border-neutral-800 rounded-xl px-4 py-2 text-xs tracking-widest lowercase text-neutral-400 hover:text-neutral-100 hover:border-neutral-600 transition-all"
          >
            <span className="text-base leading-none">←</span>
            return
          </button>

          {/* Controls legend */}
          <div className="pointer-events-auto bg-neutral-950/70 backdrop-blur-sm border border-neutral-800 rounded-xl px-5 py-4 flex flex-col gap-2">
            <p className="text-xs tracking-widest text-neutral-600 lowercase mb-1">
              controls
            </p>
            {CONTROLS_MAP.map(({ key, action }) => (
              <div key={key} className="flex items-center gap-4">
                <kbd className="text-xs text-neutral-400 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 font-mono min-w-20 text-center">
                  {key}
                </kbd>
                <span className="text-xs text-neutral-600 lowercase tracking-wide">
                  {action}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HUD toggle button */}
      {!loadError && (
        <button
          onClick={() => setHudVisible((v) => !v)}
          className="absolute bottom-6 right-6 bg-neutral-950/70 backdrop-blur-sm border border-neutral-800 rounded-xl px-4 py-2 text-xs tracking-widest lowercase text-neutral-600 hover:text-neutral-300 hover:border-neutral-600 transition-all"
        >
          {hudVisible ? "hide hud" : "show hud"}
        </button>
      )}

      {/* Subtle branding */}
      <div className="absolute bottom-6 left-6 pointer-events-none">
        <span className="text-xs tracking-[0.25em] text-neutral-800 lowercase">
          ovlt
        </span>
      </div>
    </div>
  );
}
