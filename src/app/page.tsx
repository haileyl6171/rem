"use client";

import { useState, useCallback, useRef } from "react";
import IngestScreen from "@/components/ingest-screen";
import LoadingScreen from "@/components/loading-screen";
import MemoryViewer, { type CameraState } from "@/components/memory-viewer";
import {
  DEMO_MEMORIES,
  buildDemoMemory,
  type DemoMemory,
} from "@/lib/demo-data";

type ViewState = "grid" | "loading" | "viewer";

// Length of the cream "wash" that covers the swap between screens.
const WASH_COVER_MS = 360;
const WASH_CLEAR_MS = 460;

export default function Home() {
  const [view, setView] = useState<ViewState>("grid");
  const [memories, setMemories] = useState<DemoMemory[]>(DEMO_MEMORIES);
  const [activeMemory, setActiveMemory] = useState<DemoMemory | null>(null);
  const [pending, setPending] = useState<DemoMemory | null>(null);
  const [washing, setWashing] = useState(false);
  // Per-memory camera pose, so re-entering a scene drops you where you left off.
  const [cameraStates, setCameraStates] = useState<Record<string, CameraState>>({});
  const createdCount = useRef(0);

  // Cinematic screen swap: fade a cream wash over the screen, swap the view
  // underneath it, then clear the wash so the new screen's entrance plays.
  const transitionTo = useCallback((next: ViewState, after?: () => void) => {
    setWashing(true);
    window.setTimeout(() => {
      after?.();
      setView(next);
      window.setTimeout(() => setWashing(false), WASH_CLEAR_MS);
    }, WASH_COVER_MS);
  }, []);

  // Click an existing memory tile → open its scene.
  const handleMemoryClick = useCallback(
    (id: string) => {
      const memory = memories.find((m) => m.id === id);
      if (!memory) return;
      transitionTo("viewer", () => setActiveMemory(memory));
    },
    [memories, transitionTo],
  );

  // Submit the form → run the scripted reconstruction, then reveal the scene.
  const handleGenerate = useCallback(
    (description: string) => {
      const memory = buildDemoMemory(description, createdCount.current++);
      transitionTo("loading", () => setPending(memory));
    },
    [transitionTo],
  );

  // The loading sequence finished: file the new memory into the grid and open it.
  const handleLoadingComplete = useCallback(() => {
    if (!pending) return;
    transitionTo("viewer", () => {
      setMemories((prev) => [pending, ...prev].slice(0, 8));
      setActiveMemory(pending);
      setPending(null);
    });
  }, [pending, transitionTo]);

  const handleReturn = useCallback(
    (state?: CameraState) => {
      if (activeMemory && state) {
        setCameraStates((prev) => ({ ...prev, [activeMemory.id]: state }));
      }
      transitionTo("grid", () => setActiveMemory(null));
    },
    [activeMemory, transitionTo],
  );

  // Inside the viewer, jump to a related memory's scene without leaving.
  const handleSelectRelated = useCallback(
    (id: string) => {
      const memory = memories.find((m) => m.id === id);
      if (memory) setActiveMemory(memory);
    },
    [memories],
  );

  const related = activeMemory
    ? memories.filter((m) => m.id !== activeMemory.id).slice(0, 5)
    : [];

  return (
    <main className="relative h-full w-full overflow-hidden">
      {view === "grid" && (
        <div className="h-full w-full animate-fade-in">
          <IngestScreen
            memories={memories}
            onMemoryClick={handleMemoryClick}
            onGenerate={handleGenerate}
          />
        </div>
      )}

      {view === "loading" && (
        <div className="h-full w-full animate-fade-in">
          <LoadingScreen
            description={pending?.caption}
            accent={pending?.colorProfile.accent}
            onComplete={handleLoadingComplete}
          />
        </div>
      )}

      {view === "viewer" && activeMemory && (
        <div className="h-full w-full">
          <MemoryViewer
            key={activeMemory.id}
            src={activeMemory.splatUrl}
            title={activeMemory.title}
            caption={activeMemory.caption}
            date={activeMemory.date}
            accent={activeMemory.colorProfile.accent}
            related={related}
            savedCameraState={cameraStates[activeMemory.id]}
            flip={activeMemory.flip}
            onSelectRelated={handleSelectRelated}
            onReturn={handleReturn}
          />
        </div>
      )}

      {/* Cinematic cross-dissolve overlay (cream wash with a soft vignette). */}
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0 z-50 transition-opacity ease-in-out",
          washing
            ? "opacity-100 duration-300"
            : "opacity-0 duration-500",
        ].join(" ")}
        style={{
          background:
            "radial-gradient(120% 120% at 50% 45%, #FBF9F5 0%, #F2EDE4 100%)",
        }}
      />
    </main>
  );
}
