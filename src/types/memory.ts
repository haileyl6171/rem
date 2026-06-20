// ============================================================================
//  CONTRACT C (TypeScript mirror) + CONTRACT A (HTTP shapes)
//  Owned by P2. This is the single source of truth the FRONTEND imports.
//  Keep it in sync with schema.sql.
// ============================================================================

/**
 * Pipeline status. These exact strings come from the `memories.status` column.
 * The frontend switches its UI on these; the GPU sets them.
 */
export type MemoryStatus =
  | "PENDING" // row created, GPU not started
  | "GENERATING" // Pika video + frame extraction
  | "RECONSTRUCTING" // COLMAP
  | "TRAINING" // gaussian splat training
  | "READY" // done — splat_url is set
  | "FAILED"; // error is set

/** Terminal states — stop polling when status is one of these. */
export const TERMINAL_STATUSES: MemoryStatus[] = ["READY", "FAILED"];

/**
 * A memory row, exactly as the GET endpoints return it.
 * (Mirror of the `memories` table.)
 */
export interface Memory {
  id: string;
  description: string | null;
  input_keys: string[];
  status: MemoryStatus;
  progress: number; // 0–100
  error: string | null;
  splat_url: string | null; // null until status === "READY"
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
//  CONTRACT A — HTTP request/response shapes (Frontend ↔ Backend)
// ----------------------------------------------------------------------------

/**
 * POST /api/memories
 * Sent as multipart/form-data (so the photo file rides along):
 *    description: string
 *    photo:       File   (optional)
 * Returns:
 */
export interface CreateMemoryResponse {
  id: string;
}

/**
 * GET /api/memories/:id  → Memory
 * GET /api/memories      → Memory[]
 * (No separate types needed — they return Memory / Memory[].)
 */
