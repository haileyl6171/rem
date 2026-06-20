// ============================================================================
//  Modal trigger (backend side of CONTRACT B).
//  Owned by P2. Fire-and-forget HTTP call that starts the GPU pipeline.
//  Returns almost immediately; the pipeline runs for minutes in the background.
// ============================================================================

import "server-only";

const MODAL_URL = process.env.MODAL_URL;
const MODAL_SECRET = process.env.MODAL_SECRET;

/**
 * Kick off the pipeline for a memory. Does NOT wait for it to finish.
 * The pipeline reports progress by writing to the DB (pipeline/db.py); the
 * browser learns the result by polling GET /api/memories/:id.
 *
 * CONTRACT B body:  { memoryId, inputKeys, description }
 * CONTRACT B header: X-Secret  (must equal MODAL_SECRET)
 */
export async function triggerPipeline(input: {
  memoryId: string;
  inputKeys: string[];
  description: string;
}): Promise<void> {
  if (!MODAL_URL || !MODAL_SECRET) {
    throw new Error("Missing MODAL_URL or MODAL_SECRET. See .env.example");
  }

  const res = await fetch(MODAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Secret": MODAL_SECRET,
    },
    body: JSON.stringify(input),
    // We don't await the pipeline — just the acknowledgement that it started.
  });

  if (!res.ok) {
    throw new Error(`Modal trigger failed: ${res.status} ${await res.text()}`);
  }
}
