"use client";

import { useState, useCallback } from "react";
import IngestScreen from "@/components/ingest-screen";
import LoadingScreen from "@/components/loading-screen";
import MemoryViewer from "@/components/memory-viewer";

type ViewState = "input" | "loading" | "viewer";

interface MemoryData {
  description: string;
  imageFile: File | null;
}

export default function Home() {
  const [view, setView] = useState<ViewState>("input");
  const [memoryData, setMemoryData] = useState<MemoryData>({
    description: "",
    imageFile: null,
  });

  const handleGenerate = useCallback(
    (description: string, imageFile: File | null) => {
      setMemoryData({ description, imageFile });
      setView("loading");

      // Persist the memory to the backend (Contract A: POST /api/memories).
      // This is what makes a row appear in Supabase. Fire-and-forget so the
      // loading → viewer flow continues regardless of the pipeline status.
      const form = new FormData();
      form.append("description", description);
      if (imageFile) form.append("photo", imageFile);

      fetch("/api/memories", { method: "POST", body: form })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            // A 500 here is usually just the Modal pipeline trigger not being
            // configured yet — the memory row IS still created before that step.
            console.warn("[create memory] non-OK response:", res.status, body);
          } else {
            console.info("[create memory] created:", body.id);
          }
        })
        .catch((err) => console.error("[create memory] request failed:", err));
    },
    []
  );

  const handleLoadingComplete = useCallback(() => {
    setView("viewer");
  }, []);

  const handleReturn = useCallback(() => {
    setMemoryData({ description: "", imageFile: null });
    setView("input");
  }, []);

  return (
    <main className="h-full w-full">
      {view === "input" && <IngestScreen onGenerate={handleGenerate} />}
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
