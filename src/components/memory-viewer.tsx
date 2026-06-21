"use client";

import { useEffect, useRef, useState } from "react";

interface MemoryViewerProps {
  src?: string;
  onReturn: () => void;
}

const CONTROLS_MAP = [
  { key: "W / S", action: "Move Up / Down" },
  { key: "A / D", action: "Strafe Left / Right" },
  { key: "Drag", action: "Look Around" },
  { key: "Scroll", action: "Zoom" },
] as const;

export default function MemoryViewer({ src, onReturn }: MemoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ dispose: () => void } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let disposed = false;
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;inset:0";
    containerRef.current.appendChild(host);

    const initViewer = async () => {
      try {
        const GaussianSplats3D = await import(
          "@mkkellogg/gaussian-splats-3d"
        );

        if (disposed) return;

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: host,
          cameraUp: [0, -1, 0],
          initialCameraPosition: [1, -1, 6],
          initialCameraLookAt: [0, 0, 0],
          gpuAcceleratedSort: false,
          sharedMemoryForWorkers: false,
        });

        viewerRef.current = viewer;

        const v = viewer as any;
        for (const ctrl of [v.perspectiveControls, v.orthographicControls]) {
          if (ctrl) {
            ctrl.panSpeed = 3.0;
            ctrl.keyPanSpeed = 40.0;
          }
        }

        const splatUrl = src || "/bonsai.splat";

        await viewer.addSplatScene(splatUrl, {
          progressiveLoad: true,
        });

        if (disposed) return;

        viewer.start();
        setIsLoaded(true);
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
      host.remove();
    };
  }, [src]);

  return (
    <div className="relative h-full w-full bg-[#1A1817] overflow-hidden font-sans">
      {/* Three.js / WebGL canvas mount target */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading indicator (pre-scene) */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#F7F5F0]">
          <div className="flex flex-col items-center gap-6">
            <div className="w-8 h-8 rounded-full border-[1px] border-[#E2DCD0] border-t-[#C86B3C] animate-spin" />
            <span className="text-[10px] text-[#7A6B63] tracking-[0.3em] uppercase">
              Loading Splat...
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 sm:px-8 bg-[#F7F5F0]">
          <p className="text-sm font-serif text-[#C86B3C] text-center max-w-sm">
            {loadError}
          </p>
          <p className="text-[10px] text-[#7A6B63] tracking-[0.2em] uppercase">
            ensure <code className="text-[#4A3320]">sample_memory.splat</code>{" "}
            exists in <code className="text-[#4A3320]">/public</code>
          </p>
          <button
            onClick={onReturn}
            className="mt-4 text-[10px] tracking-[0.3em] uppercase text-[#4A3320] hover:text-[#C86B3C] transition-colors border-b border-[#E2DCD0] pb-1"
          >
            Return
          </button>
        </div>
      )}

      {/* HUD overlay */}
      {!loadError && (
        <div
          className={[
            "absolute inset-x-0 top-0 flex flex-col sm:flex-row items-start justify-between gap-3 p-4 sm:p-8 pointer-events-none transition-opacity duration-500",
            hudVisible ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {/* Return button */}
          <button
            onClick={onReturn}
            className="pointer-events-auto flex items-center gap-3 bg-[#F7F5F0] border border-[#E2DCD0] px-4 py-2.5 sm:px-5 sm:py-3 text-[10px] tracking-[0.2em] uppercase text-[#4A3320] hover:text-[#C86B3C] transition-all shadow-sm"
          >
            <span className="text-lg leading-none font-serif">←</span>
            Return
          </button>

          {/* Controls legend */}
          <div className="pointer-events-auto bg-[#F7F5F0] border border-[#E2DCD0] px-4 py-3 sm:px-6 sm:py-5 hidden sm:flex sm:flex-col gap-2 sm:gap-3 shadow-sm min-w-[180px] sm:min-w-[200px]">
            <p className="text-[9px] tracking-[0.3em] text-[#B5AD9F] uppercase mb-1 sm:mb-2 border-b border-[#E2DCD0] pb-2">
              Controls
            </p>
            {CONTROLS_MAP.map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between gap-4 sm:gap-6">
                <span className="text-[10px] text-[#7A6B63] uppercase tracking-wider">
                  {action}
                </span>
                <kbd className="text-[10px] text-[#4A3320] font-medium tracking-widest">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HUD toggle button */}
      {!loadError && (
        <button
          onClick={() => setHudVisible((v) => !v)}
          className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 pointer-events-auto bg-[#F7F5F0] border border-[#E2DCD0] px-4 py-2.5 sm:px-5 sm:py-3 text-[9px] tracking-[0.2em] uppercase text-[#7A6B63] hover:text-[#C86B3C] transition-all shadow-sm"
        >
          {hudVisible ? "Hide HUD" : "Show HUD"}
        </button>
      )}

      {/* Subtle branding */}
      <div className="absolute bottom-4 left-4 sm:bottom-8 sm:left-8 pointer-events-none">
        <span className="text-xl sm:text-2xl font-serif text-[#F7F5F0]/50">
          Rem
        </span>
      </div>
    </div>
  );
}