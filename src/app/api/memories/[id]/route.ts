// ============================================================================
//  GET /api/memories/:id  — status poll endpoint  (CONTRACT A)
//  Owned by P2. The browser hits this every ~2s until status is terminal.
//
//  ⚠️ Next 16: the second arg's `params` is a PROMISE — you MUST await it.
//     This is the App Router change most likely to bite you. Verify the exact
//     shape against node_modules/next/dist/docs after `npm install`.
// ============================================================================

import { NextResponse } from "next/server";
import { getMemory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // ← await, per Next 16

  const memory = await getMemory(id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Returns the full Memory row: status, progress, splat_url, error, ...
  return NextResponse.json(memory);
}
