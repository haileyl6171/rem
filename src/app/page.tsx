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
  { id: "1", title: "Golden hour on the porch", colorProfile: { base: "#8B4513", accent: "#A65E2E" } },
  { id: "2", title: "Morning fog in the valley", colorProfile: { base: "#C87533", accent: "#E09050" } },
  { id: "3", title: "Rain on the cobblestones", colorProfile: { base: "#A0522D", accent: "#BF6F45" } },
  { id: "4", title: "Autumn leaves at the creek", colorProfile: { base: "#D4883A", accent: "#E8A060" } },
  { id: "5", title: "Dusty road at sunset", colorProfile: { base: "#6B3A2A", accent: "#8B5540" } },
  { id: "6", title: "Old bookshop on Market St", colorProfile: { base: "#CC6B3C", accent: "#E08858" } },
  { id: "7", title: "Wind through the wheat field", colorProfile: { base: "#8E6540", accent: "#B08560" } },
  { id: "8", title: "First snow on the rooftop", colorProfile: { base: "#5C3D2E", accent: "#7A5845" } },
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
