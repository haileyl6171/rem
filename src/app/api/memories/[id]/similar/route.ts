// ============================================================================
//  GET /api/memories/:id/similar  — "find memories like this one"
//  Owned by P2. Powered by Redis vector similarity (src/lib/memory-search.ts).
//
//  Returns up to `?k=` (default 6) semantically similar OTHER memories, most
//  similar first, each with a `score` in [0,1]. The viewer can show these as
//  "Related memories" so the user can jump between connected scenes.
// ============================================================================

import { NextResponse } from "next/server";
import { traceChain } from "@arizeai/phoenix-otel";
import { getMemory } from "@/lib/db";
import { findSimilarMemories } from "@/lib/memory-search";
import { withMemoryTrace } from "@/lib/tracing";

export const runtime = "nodejs";

const handleSimilar = traceChain(
  async (request: Request, id: string) => {
    const memory = await getMemory(id);
    if (!memory) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const k = Number(new URL(request.url).searchParams.get("k")) || 6;

    return withMemoryTrace(id, async () => {
      try {
        const similar = await findSimilarMemories(
          { id: memory.id, description: memory.description ?? "" },
          k,
        );
        return NextResponse.json(similar);
      } catch (err) {
        console.error("[similar] search failed:", err);
        return NextResponse.json([], {
          headers: { "x-similar-error": err instanceof Error ? err.message : "1" },
        });
      }
    });
  },
  { name: "GET /api/memories/:id/similar" },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleSimilar(request, id);
}
