"use client";

// ============================================================================
//  /memories/[id]  — ONE memory: shows the progress bar while the pipeline
//  runs, then swaps to the 3D viewer when status === "READY".
//  Owned by P1.
//
//  This replaces the FAKED loading→viewer flow currently inside
//  src/app/page.tsx. The real flow:
//     ingest screen → POST /api/memories → router.push(`/memories/${id}`)
//     → THIS page polls GET /api/memories/:id → renders viewer on READY.
//
//  Next 16: in a CLIENT component, read the route param with useParams()
//  (the async `params` prop is for SERVER components).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Memory } from "@/types/memory";
import { TERMINAL_STATUSES } from "@/types/memory";
import LoadingScreen from "@/components/loading-screen";
import MemoryViewer from "@/components/memory-viewer";

const POLL_MS = 2000;

export default function MemoryPage() {
  const { id } = useParams<{ id: string }>();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;

    async function poll() {
      try {
        const res = await fetch(`/api/memories/${id}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data: Memory = await res.json();
        setMemory(data);

        // Stop polling once we reach a terminal state.
        if (TERMINAL_STATUSES.includes(data.status) && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load memory");
      }
    }

    poll(); // immediate first check
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [id]);

  // ----- render by status -----
  if (error) return <ErrorView message={error} />;
  if (!memory) return <LoadingScreen description="loading…" onComplete={() => {}} />;

  if (memory.status === "FAILED") {
    return <ErrorView message={memory.error ?? "generation failed"} />;
  }

  if (memory.status === "READY" && memory.splat_url) {
    // TODO(P1): add a `src` prop to MemoryViewer and load memory.splat_url
    // instead of the hardcoded /sample_memory.splat. See memory-viewer.tsx.
    return <MemoryViewer src={memory.splat_url} onReturn={() => history.back()} />;
  }

  // PENDING | GENERATING | RECONSTRUCTING | TRAINING
  // TODO(P1): pass status + progress into LoadingScreen for a real progress bar.
  return (
    <LoadingScreen
      description={memory.description ?? ""}
      onComplete={() => {}}
      // status={memory.status}
      // progress={memory.progress}
    />
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-8">
      <p className="text-xs text-red-500/70 tracking-wider lowercase text-center max-w-sm">
        {message}
      </p>
      <a
        href="/"
        className="text-xs tracking-[0.25em] lowercase text-neutral-400 hover:text-neutral-100"
      >
        ← start over
      </a>
    </div>
  );
}
