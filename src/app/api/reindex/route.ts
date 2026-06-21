// ============================================================================
//  POST /api/reindex — backfill every memory's embedding into the Redis vector
//  index. The create path (POST /api/memories) indexes new memories, but this
//  rebuilds the index for EXISTING rows — needed after switching REDIS_URL
//  (e.g. to a local Redis Stack when Redis Cloud is network-blocked, see
//  ARIZE.md) or changing the embedding model. Embeds with 429 backoff.
// ============================================================================
import { NextResponse } from "next/server";
import { listMemories } from "@/lib/db";
import { indexMemory } from "@/lib/memory-search";

export const runtime = "nodejs";

export async function POST() {
  const memories = await listMemories();
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const m of memories) {
    if (!m.description?.trim()) continue;
    try {
      await indexMemory({
        id: m.id,
        description: m.description,
        status: m.status ?? "PENDING",
        splat_url: m.splat_url ?? null,
        created_at: m.created_at,
      });
      done.push(m.id);
    } catch (err) {
      failed.push({ id: m.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ indexed: done.length, failed });
}
