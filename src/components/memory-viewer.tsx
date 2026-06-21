"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface CameraState {
  position: [number, number, number];
  lookAt: [number, number, number];
}

interface MemoryViewerProps {
  src?: string;
  savedCameraState?: CameraState;
  onReturn: (cameraState?: CameraState) => void;
}

const CONTROLS_MAP = [
  { key: "W / S", action: "Move Up / Down" },
  { key: "A / D", action: "Strafe Left / Right" },
  { key: "Drag", action: "Look Around" },
  { key: "Scroll", action: "Zoom" },
] as const;

export default function MemoryViewer({ src, savedCameraState, onReturn }: MemoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);

  const getCameraState = useCallback((): CameraState | undefined => {
    const v = viewerRef.current;
    if (!v) return undefined;
    const camera = v.camera;
    if (!camera) return undefined;
    const controls = v.perspectiveControls || v.orthographicControls;
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      lookAt: controls?.target
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [0, 0, 0],
    };
  }, []);

  const handleReturn = useCallback(() => {
    onReturn(getCameraState());
  }, [onReturn, getCameraState]);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let disposed = false;

    const initViewer = async () => {
      try {
        const GaussianSplats3D = await import(
          "@mkkellogg/gaussian-splats-3d"
        );

        if (disposed || !containerRef.current) return;

        containerRef.current.innerHTML = "";

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: containerRef.current,
          cameraUp: [0, -1, 0],
          initialCameraPosition: savedCameraState?.position ?? [1, -1, 6],
          initialCameraLookAt: savedCameraState?.lookAt ?? [0, 0, 0],
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
        } catch {}
        viewerRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [src]);

  return (
    <div className="relative h-full w-full bg-[#0A0A0A] overflow-hidden font-[family-name:var(--font-space-grotesk)]">
      <div ref={containerRef} className="absolute inset-0" />

      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#0A0A0A]">
          <div className="flex flex-col items-center gap-6">
            <div className="w-8 h-8 rounded-full border-[1px] border-[#222222] border-t-white animate-spin" />
            <span className="font-[family-name:var(--font-space-mono)] text-[10px] text-[#666666] tracking-[0.3em] uppercase">
              Loading Splat...
            </span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-[#0A0A0A]">
          <p className="text-sm text-[#888888] text-center max-w-sm">
            {loadError}
          </p>
          <p className="font-[family-name:var(--font-space-mono)] text-[10px] text-[#666666] tracking-[0.2em] uppercase">
            ensure <code className="text-[#CCCCCC]">sample_memory.splat</code>{" "}
            exists in <code className="text-[#CCCCCC]">/public</code>
          </p>
          <button
            onClick={handleReturn}
            className="mt-4 font-[family-name:var(--font-space-mono)] text-[10px] tracking-[0.3em] uppercase text-[#888888] hover:text-white transition-colors border-b border-[#333333] pb-1"
          >
            Return
          </button>
        </div>
      )}

      {!loadError && (
        <div
          className={[
            "absolute inset-x-0 top-0 flex items-start justify-between p-8 pointer-events-none transition-opacity duration-500",
            hudVisible ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <button
            onClick={handleReturn}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-[#111111] border border-[#2A2A2A] px-5 py-3 font-[family-name:var(--font-space-mono)] text-[10px] tracking-[0.2em] uppercase text-[#888888] hover:text-white transition-all"
          >
            <span className="text-lg leading-none">←</span>
            Return
          </button>

          <div className="pointer-events-auto rounded-xl bg-[#111111] border border-[#2A2A2A] px-6 py-5 flex flex-col gap-3 min-w-[200px]">
            <p className="font-[family-name:var(--font-space-mono)] text-[9px] tracking-[0.3em] text-[#555555] uppercase mb-2 border-b border-[#222222] pb-2">
              Controls
            </p>
            {CONTROLS_MAP.map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between gap-6">
                <span className="font-[family-name:var(--font-space-mono)] text-[10px] text-[#666666] uppercase tracking-wider">
                  {action}
                </span>
                <kbd className="font-[family-name:var(--font-space-mono)] text-[10px] text-[#CCCCCC] font-medium tracking-widest">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadError && (
        <button
          onClick={() => setHudVisible((v) => !v)}
          className="absolute bottom-8 right-8 pointer-events-auto rounded-xl bg-[#111111] border border-[#2A2A2A] px-5 py-3 font-[family-name:var(--font-space-mono)] text-[9px] tracking-[0.2em] uppercase text-[#666666] hover:text-white transition-all"
        >
          {hudVisible ? "Hide HUD" : "Show HUD"}
        </button>
      )}

      <div className="absolute bottom-8 left-8 pointer-events-none">
        <span className="text-2xl font-light tracking-widest text-white/30">
          rem
        </span>
      </div>
    </div>
  );
}
