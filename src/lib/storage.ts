// ============================================================================
//  Storage helpers (backend side of CONTRACT D).
//  Owned by P2. Uploads user photos and hands back the Storage path/key.
//  The GPU writes the .splat; the browser reads it directly via its public URL.
// ============================================================================

import { supabase, MEMORIES_BUCKET } from "@/lib/supabase";

/**
 * Upload one user photo for a memory.
 * Path convention (CONTRACT D):  memories/<id>/inputs/<filename>
 * Returns the storage KEY (not the URL) — that's what we store in input_keys
 * and pass to the pipeline.
 */
export async function uploadInput(
  memoryId: string,
  file: File,
): Promise<string> {
  // Sanitize the filename to avoid weird path chars.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `memories/${memoryId}/inputs/${safeName}`;

  const { error } = await supabase.storage
    .from(MEMORIES_BUCKET)
    .upload(key, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return key;
}

/**
 * Public URL for a storage key (bucket must be public).
 * Not usually needed in the backend — the pipeline computes the splat URL —
 * but handy if you ever need to turn a key into a link server-side.
 */
export function publicUrl(key: string): string {
  return supabase.storage.from(MEMORIES_BUCKET).getPublicUrl(key).data
    .publicUrl;
}
