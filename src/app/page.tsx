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
