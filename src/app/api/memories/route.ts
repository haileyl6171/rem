// ============================================================================
//  POST /api/memories   — create a memory + start the pipeline   (CONTRACT A)
//  GET  /api/memories   — list memories (optional gallery)
//  Owned by P2.
//
//  Next 16 notes (VERIFY against node_modules/next/dist/docs after `npm i`):
//    • Route handlers export named async functions (GET, POST, ...).
//    • Default runtime is Node.js — required here (Supabase service key + file
//      upload). We set it explicitly for clarity.
// ============================================================================

import { NextResponse } from "next/server";
import { createMemory, listMemories } from "@/lib/db";
import { uploadInput } from "@/lib/storage";
import { triggerPipeline } from "@/lib/modal";
import type { CreateMemoryResponse } from "@/types/memory";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // The frontend sends multipart/form-data so the photo file rides along.
  const form = await request.formData();
  const description = String(form.get("description") ?? "").trim();
  const photo = form.get("photo");

  if (!description && !photo) {
    return NextResponse.json(
      { error: "Provide a description and/or a photo." },
      { status: 400 },
    );
  }

  // 1. Create the row (PENDING) so we have an id to namespace storage under.
  const id = await createMemory({ description, inputKeys: [] });

  // 2. Upload the photo (if any) to memories/<id>/inputs/... and collect keys.
  const inputKeys: string[] = [];
  if (photo instanceof File && photo.size > 0) {
    inputKeys.push(await uploadInput(id, photo));
    // TODO(P2): persist inputKeys back onto the row (small update) so the
    // pipeline can also read them from the DB if you prefer that over passing
    // them in the trigger body. For now we pass them in the trigger (step 3).
  }

  // 3. Fire-and-forget: start the GPU pipeline. Returns fast.
  await triggerPipeline({ memoryId: id, inputKeys, description });

  const body: CreateMemoryResponse = { id };
  return NextResponse.json(body, { status: 201 });
}

export async function GET() {
  const memories = await listMemories();
  return NextResponse.json(memories);
}
