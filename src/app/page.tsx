"use client";

import { useState, useCallback, useRef } from "react";
import IngestScreen, { type MemoryEntry } from "@/components/ingest-screen";
import LoadingScreen from "@/components/loading-screen";
import MemoryViewer, { type CameraState } from "@/components/memory-viewer";

type ViewState = "input" | "loading" | "viewer";

interface MemoryData {
  description: string;
  imageFiles: File[];
  videoFile: File | null;
}

const DEMO_MEMORIES: MemoryEntry[] = [
  { id: "1", title: "Ping Pong", splatUrl: "/Ping_pong.ply", colorProfile: { base: "#1A1A1A", accent: "#3A3A3A" } },
  { id: "2", title: "Redbull Scene", splatUrl: "/Redbull_Scene.ply", colorProfile: { base: "#0F0F0F", accent: "#2E2E2E" } },
  { id: "3", title: "Suhaan Stage", splatUrl: "/Suhaan_Stage.ply", colorProfile: { base: "#222222", accent: "#444444" } },
  { id: "4", title: "Craft Room", splatUrl: "/craft_room.ply", colorProfile: { base: "#181818", accent: "#383838" } },
];

export default function Home() {
  const [view, setView] = useState<ViewState>("input");
  const [viewerSrc, setViewerSrc] = useState<string | undefined>();
  const cameraStates = useRef<Map<string, CameraState>>(new Map());
  const [memoryData, setMemoryData] = useState<MemoryData>({
    description: "",
    imageFiles: [],
    videoFile: null,
  });

  const handleGenerate = useCallback(
    (description: string, imageFiles: File[], videoFile: File | null) => {
      setMemoryData({ description, imageFiles, videoFile });
      setView("loading");

      const form = new FormData();
      form.append("description", description);
      imageFiles.forEach((file) => form.append("photos", file));
      if (videoFile) form.append("video", videoFile);

      fetch("/api/memories", { method: "POST", body: form })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.warn("[create memory] non-OK response:", res.status, body);
          } else {
            console.info("[create memory] created:", body.id);
          }
        })
        .catch((err) => console.error("[create memory] request failed:", err));
    },
    []
  );

  const handleMemoryClick = useCallback((id: string) => {
    const mem = DEMO_MEMORIES.find(m => m.id === id);
    setViewerSrc(mem?.splatUrl);
    setView("viewer");
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setView("viewer");
  }, []);

  const handleReturn = useCallback((cameraState?: CameraState) => {
    if (viewerSrc && cameraState) {
      cameraStates.current.set(viewerSrc, cameraState);
    }
    setMemoryData({ description: "", imageFiles: [], videoFile: null });
    setView("input");
  }, [viewerSrc]);

  return (
    <main className="h-full w-full">
      {view === "input" && (
        <IngestScreen
          memories={DEMO_MEMORIES}
          onMemoryClick={handleMemoryClick}
          onGenerate={handleGenerate}
        />
      )}
      {view === "loading" && (
        <LoadingScreen
          description={memoryData.description}
          onComplete={handleLoadingComplete}
        />
      )}
      {view === "viewer" && (
        <MemoryViewer
          src={viewerSrc}
          savedCameraState={viewerSrc ? cameraStates.current.get(viewerSrc) : undefined}
          onReturn={handleReturn}
        />
      )}
    </main>
  );
}
