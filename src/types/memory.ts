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
 * Structured read of a memory's scene, produced by the compose_scene agent
 * before generation and cached on the row. Drives cross-memory coherence.
 * (Mirror of the `memories.analysis` jsonb column.)
 */
export interface SceneAnalysis {
  people: string[]; // recurring people named/implied in the scene
  places: string[]; // settings — "grandma's kitchen", "the lake dock"
  objects: string[]; // recurring props/subjects in frame
  palette: string[]; // dominant colors/tones
  lighting: string | null; // "golden-hour window light", "overcast"
  mood: string | null; // emotional register of the scene
  motifs: string[]; // recurring visual ideas
}

/**
 * One-time read of the user's UPLOADED PHOTOS, produced by Claude the first time
 * a memory's images arrive and cached on the row. Distinct from SceneAnalysis:
 * this is what the photos literally show, computed once and never recomputed.
 * (Mirror of the `memories.vision` jsonb column.)
 */
export interface PhotoAnalysis {
  summary: string; // 1–2 sentences: what the photos literally show
  people: string[]; // people visible in the photos
  places: string[]; // settings visible in the photos
  objects: string[]; // notable objects/subjects in frame
  palette: string[]; // dominant colors/tones
  lighting: string | null; // observed lighting
  mood: string | null; // emotional register
}

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
  vision: PhotoAnalysis | null; // null until photos are analyzed once
  analysis: SceneAnalysis | null; // null until compose_scene runs
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
