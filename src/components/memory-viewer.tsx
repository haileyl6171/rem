"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/** Camera pose persisted per-memory so you re-enter where you left off. */
export interface CameraState {
  position: [number, number, number];
  lookAt: [number, number, number];
}

interface RelatedMemory {
  id: string;
  title: string;
  colorProfile: { base: string; accent: string };
}

interface MemoryViewerProps {
  src?: string;
  title?: string;
  caption?: string;
  date?: string;
  accent?: string;
  related?: RelatedMemory[];
  savedCameraState?: CameraState;
  onSelectRelated?: (id: string) => void;
  onReturn: (cameraState?: CameraState) => void;
}

const CONTROLS_MAP = [
  { key: "W / S", action: "Forward / Back" },
  { key: "Q / E", action: "Up / Down" },
  { key: "A / D", action: "Strafe" },
  { key: "Drag", action: "Look Around" },
  { key: "Scroll", action: "Zoom" },
] as const;

const DEFAULT_ACCENT = "#5B89A6";

// Free-fly movement speed (scene units / frame). Tune if walking feels too
// fast/slow for these scenes.
const MOVE_SPEED = 0.02;
const MOVE_CODES = new Set(["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE"]);

// Minimal shapes for the splat viewer's camera + orbit controls.
interface OrbitLike {
  target: THREE.Vector3;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  panSpeed: number;
  keyPanSpeed: number;
  zoomSpeed: number;
  zoomToCursor: boolean;
  keys: { LEFT: string; UP: string; RIGHT: string; BOTTOM: string };
}
interface SplatViewer {
  camera?: THREE.PerspectiveCamera;
  perspectiveControls?: OrbitLike;
  orthographicControls?: OrbitLike;
  start(): void;
  dispose(): void;
  addSplatScene(url: string, opts?: { progressiveLoad?: boolean }): Promise<void>;
}

export default function MemoryViewer({
  src,
  title,
  caption,
  date,
  accent = DEFAULT_ACCENT,
  related = [],
  savedCameraState,
  onSelectRelated,
  onReturn,
}: MemoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SplatViewer | null>(null);
  // The saved pose to enter with — captured once at mount (the parent remounts
  // this component per memory via `key`).
  const savedRef = useRef(savedCameraState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  // The title card shows on entry, then fades away on its own.
  const [showTitleCard, setShowTitleCard] = useState(true);

  // Read the current camera pose out of the live viewer.
  const getCameraState = useCallback((): CameraState | undefined => {
    const v = viewerRef.current;
    const cam = v?.camera;
    if (!cam) return undefined;
    const ctrl = v?.perspectiveControls || v?.orthographicControls;
    const target = ctrl?.target;
    return {
      position: [cam.position.x, cam.position.y, cam.position.z],
      lookAt: target ? [target.x, target.y, target.z] : [0, 0, 0],
    };
  }, []);

  // Returning hands the current pose back up so it can be restored on re-entry.
  const handleReturn = useCallback(() => {
    onReturn(getCameraState());
  }, [onReturn, getCameraState]);

  useEffect(() => {
    const t = setTimeout(() => setShowTitleCard(false), 4200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let disposed = false;
    let raf = 0;
    const pressed = new Set<string>();

    // ---- Free-fly movement: W/S forward-back, Q/E up-down, A/D strafe -------
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) {
        pressed.add(e.code);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => pressed.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const fwd = new THREE.Vector3();
    const up = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();

    const applyMovement = () => {
      const v = viewerRef.current;
      const cam = v?.camera;
      const ctrl = v?.perspectiveControls || v?.orthographicControls;
      if (!cam || !ctrl || pressed.size === 0) return;

      fwd.subVectors(ctrl.target, cam.position).normalize();
      up.copy(cam.up).normalize();
      right.crossVectors(fwd, up).normalize();
      move.set(0, 0, 0);
      if (pressed.has("KeyW")) move.add(fwd);
      if (pressed.has("KeyS")) move.sub(fwd);
      if (pressed.has("KeyQ")) move.add(up);
      if (pressed.has("KeyE")) move.sub(up);
      if (pressed.has("KeyD")) move.add(right);
      if (pressed.has("KeyA")) move.sub(right);
      if (move.lengthSq() === 0) return;

      move.normalize().multiplyScalar(MOVE_SPEED);
      // Translate camera AND target together → we dolly/fly without changing the
      // orbit angle (so drag-to-look still works around the new spot).
      cam.position.add(move);
      ctrl.target.add(move);
    };

    const loop = () => {
      applyMovement();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const initViewer = async () => {
      try {
        const GaussianSplats3D = await import("@mkkellogg/gaussian-splats-3d");
        if (disposed || !containerRef.current) return;

        // Clear any leftover canvas from a previous scene / Strict Mode mount.
        containerRef.current.innerHTML = "";

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: containerRef.current,
          cameraUp: [0, -1, 0],
          initialCameraPosition: savedRef.current?.position ?? [1, -1, 6],
          initialCameraLookAt: savedRef.current?.lookAt ?? [0, 0, 0],
          gpuAcceleratedSort: false,
          sharedMemoryForWorkers: false,
        }) as unknown as SplatViewer;

        viewerRef.current = viewer;

        // Open the controls up: full look up/down, free dolly, and hand W/A/S/D
        // off to our movement handler (clear the built-in key-pan bindings).
        for (const ctrl of [viewer.perspectiveControls, viewer.orthographicControls]) {
          if (!ctrl) continue;
          ctrl.panSpeed = 3.0;
          ctrl.keyPanSpeed = 40.0;
          ctrl.zoomSpeed = 1.2;
          ctrl.zoomToCursor = true; // dolly toward the cursor, not the center
          ctrl.minPolarAngle = 0.01;
          ctrl.maxPolarAngle = Math.PI - 0.01;
          ctrl.minDistance = 0.01;
          ctrl.maxDistance = 1000;
          ctrl.keys = { LEFT: "None", UP: "None", RIGHT: "None", BOTTOM: "None" };
        }

        const splatUrl = src || "/sample_memory.splat";

        await viewer.addSplatScene(splatUrl, { progressiveLoad: true });
        if (disposed) return;

        viewer.start();
        setIsLoaded(true);
      } catch (err) {
        if (!disposed) {
          console.error("[MemoryViewer] failed to initialise viewer:", err);
          setLoadError(
            err instanceof Error ? err.message : "failed to load 3d memory",
          );
        }
      }
    };

    initViewer();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch {
          // Silence teardown errors.
        }
        viewerRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [src]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0E141B] font-sans">
      {/* WebGL canvas mount target */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading veil (pre-scene) */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#EEF2F6] animate-fade-in">
          <div className="flex flex-col items-center gap-6">
            <div
              className="h-8 w-8 rounded-full border-[1.5px] border-[#D3DBE3] animate-spin"
              style={{ borderTopColor: accent }}
            />
            <span className="text-[10px] text-[#586571] tracking-[0.3em] uppercase">
              Entering memory…
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-[#EEF2F6]">
          <p className="text-sm font-serif text-[#3E6E8E] text-center max-w-sm">
            {loadError}
          </p>
          <p className="text-[10px] text-[#8A96A2] tracking-[0.2em] uppercase">
            ensure the <code className="text-[#2A323B]">.splat</code> exists in{" "}
            <code className="text-[#2A323B]">/public</code>
          </p>
          <button
            onClick={handleReturn}
            className="mt-4 text-[10px] tracking-[0.3em] uppercase text-[#2A323B] hover:text-[#3E6E8E] transition-colors border-b border-[#D3DBE3] pb-1"
          >
            Return
          </button>
        </div>
      )}

      {/* Cinematic title card — fades in on entry, drifts away */}
      {isLoaded && title && (
        <div
          className={[
            "pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-2 px-8 text-center transition-all duration-1000",
            showTitleCard ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          ].join(" ")}
        >
          {date && (
            <span className="text-[9px] tracking-[0.4em] uppercase text-white/50">
              {date}
            </span>
          )}
          <h2 className="font-serif text-3xl text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            {title}
          </h2>
          {caption && (
            <p className="max-w-md font-serif text-sm italic text-white/70 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
              &quot;{caption}&quot;
            </p>
          )}
        </div>
      )}

      {/* HUD overlay */}
      {!loadError && (
        <div
          className={[
            "absolute inset-x-0 top-0 flex items-start justify-between p-6 transition-opacity duration-500",
            hudVisible ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          {/* Return button */}
          <button
            onClick={handleReturn}
            className="glass-dark pointer-events-auto flex items-center gap-3 rounded-full px-5 py-3 text-[10px] tracking-[0.2em] uppercase text-white/85 hover:text-white transition-all animate-fade-in-down"
          >
            <span className="text-lg leading-none font-serif">←</span>
            Memories
          </button>

          {/* Controls legend */}
          <div className="glass-dark pointer-events-auto rounded-2xl px-6 py-5 flex flex-col gap-3 min-w-[200px] animate-fade-in-down">
            <p className="text-[9px] tracking-[0.3em] text-white/40 uppercase mb-1 border-b border-white/10 pb-2">
              Controls
            </p>
            {CONTROLS_MAP.map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between gap-6">
                <span className="text-[10px] text-white/60 uppercase tracking-wider">
                  {action}
                </span>
                <kbd className="text-[10px] text-white/90 font-medium tracking-widest">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related memories strip */}
      {!loadError && related.length > 0 && (
        <div
          className={[
            "absolute inset-x-0 bottom-6 flex justify-center transition-opacity duration-500",
            hudVisible ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <div className="glass-dark pointer-events-auto flex items-center gap-4 rounded-full px-5 py-3 animate-fade-in-up">
            <span className="text-[9px] tracking-[0.25em] uppercase text-white/40">
              Related
            </span>
            <div className="flex items-center gap-2">
              {related.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelectRelated?.(m.id)}
                  title={m.title}
                  className="group relative h-8 w-8 rounded-full border border-white/20 transition-transform hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${m.colorProfile.base}, ${m.colorProfile.accent})`,
                  }}
                >
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/70 px-2 py-1 text-[9px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                    {m.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HUD toggle */}
      {!loadError && (
        <button
          onClick={() => setHudVisible((s) => !s)}
          className="glass-dark absolute bottom-6 right-6 pointer-events-auto rounded-full px-5 py-3 text-[9px] tracking-[0.2em] uppercase text-white/60 hover:text-white transition-all"
        >
          {hudVisible ? "Hide HUD" : "Show HUD"}
        </button>
      )}

      {/* Branding */}
      <div className="absolute bottom-6 left-6 pointer-events-none">
        <span className="text-2xl font-serif text-white/40">rem</span>
      </div>
    </div>
  );
}
