// ============================================================================
//  GET /api/memories/:id/similar  — "find memories like this one"
//  Owned by P2. Powered by Redis vector similarity (src/lib/memory-search.ts).
//
//  Returns up to `?k=` (default 6) semantically similar OTHER memories, most
//  similar first, each with a `score` in [0,1]. The viewer can show these as
//  "Related memories" so the user can jump between connected scenes.
// ============================================================================

import { NextResponse } from "next/server";
import { getMemory } from "@/lib/db";
import { findSimilarMemories } from "@/lib/memory-search";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // ← await, per Next 16

  const memory = await getMemory(id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const k = Number(new URL(request.url).searchParams.get("k")) || 6;

  try {
    const similar = await findSimilarMemories(
      { id: memory.id, description: memory.description ?? "" },
      k,
    );
    return NextResponse.json(similar);
  } catch (err) {
    // Redis/embeddings are an enhancement — never 500 the page over them.
    console.error("[similar] search failed:", err);
    return NextResponse.json([], {
      headers: { "x-similar-error": err instanceof Error ? err.message : "1" },
    });
  }
}
