"use client";

import { useState, useCallback } from "react";
import IngestScreen, { type MemoryEntry } from "@/components/ingest-screen";
import LoadingScreen from "@/components/loading-screen";
import MemoryViewer from "@/components/memory-viewer";

type ViewState = "input" | "loading" | "viewer";

interface MemoryData {
  description: string;
  imageFiles: File[];
  videoFile: File | null;
}

const DEMO_MEMORIES: MemoryEntry[] = [
  { id: "1", title: "Golden hour on the porch", splatUrl: "/bonsai.splat", colorProfile: { base: "#1A1A1A", accent: "#3A3A3A" } },
  { id: "2", title: "Morning fog in the valley", splatUrl: "/bonsai.splat", colorProfile: { base: "#0F0F0F", accent: "#2E2E2E" } },
  { id: "3", title: "Rain on the cobblestones", splatUrl: "/bonsai.splat", colorProfile: { base: "#222222", accent: "#444444" } },
  { id: "4", title: "Autumn leaves at the creek", splatUrl: "/bonsai.splat", colorProfile: { base: "#181818", accent: "#383838" } },
  { id: "5", title: "Dusty road at sunset", splatUrl: "/bonsai.splat", colorProfile: { base: "#111111", accent: "#333333" } },
  { id: "6", title: "Old bookshop on Market St", splatUrl: "/bonsai.splat", colorProfile: { base: "#1E1E1E", accent: "#404040" } },
  { id: "7", title: "Wind through the wheat field", splatUrl: "/bonsai.splat", colorProfile: { base: "#151515", accent: "#353535" } },
  { id: "8", title: "First snow on the rooftop", splatUrl: "/bonsai.splat", colorProfile: { base: "#0D0D0D", accent: "#2A2A2A" } },
];

export default function Home() {
  const [view, setView] = useState<ViewState>("input");
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

  const handleMemoryClick = useCallback(() => {
    setView("viewer");
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setView("viewer");
  }, []);

  const handleReturn = useCallback(() => {
    setMemoryData({ description: "", imageFiles: [], videoFile: null });
    setView("input");
  }, []);

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
      {view === "viewer" && <MemoryViewer onReturn={handleReturn} />}
    </main>
  );
}
