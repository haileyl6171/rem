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
import { traceChain } from "@arizeai/phoenix-otel";
import { createMemory, listMemories } from "@/lib/db";
import { uploadInput } from "@/lib/storage";
import { triggerPipeline } from "@/lib/modal";
import { indexMemory } from "@/lib/memory-search";
import { withMemoryTrace } from "@/lib/tracing";
import type { CreateMemoryResponse } from "@/types/memory";

export const runtime = "nodejs";

const handleCreateMemory = traceChain(
  async (request: Request) => {
    const form = await request.formData();
    const description = String(form.get("description") ?? "").trim();
    const photos = form.getAll("photos").filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );

    if (photos.length < 3) {
      return NextResponse.json(
        { error: "At least 3 photos are required." },
        { status: 400 },
      );
    }

    const id = await createMemory({ description, inputKeys: [] });

    return withMemoryTrace(id, async () => {
      const inputKeys: string[] = [];
      for (const photo of photos) {
        inputKeys.push(await uploadInput(id, photo));
      }

      if (description) {
        try {
          await indexMemory({ id, description, status: "PENDING" });
        } catch (err) {
          console.error("[memory-search] index failed for", id, err);
        }
      }

      await triggerPipeline({ memoryId: id, inputKeys, description });

      const body: CreateMemoryResponse = { id };
      return NextResponse.json(body, { status: 201 });
    });
  },
  { name: "POST /api/memories" },
);

export async function POST(request: Request) {
  return handleCreateMemory(request);
}

export async function GET() {
  const memories = await listMemories();
  return NextResponse.json(memories);
}
