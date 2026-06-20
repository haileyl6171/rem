// ============================================================================
//  DB query helpers (backend side of CONTRACT C).
//  Owned by P2. The ONLY place the Next app reads/writes the memories table.
//  Route handlers call these — they never touch the supabase client directly.
// ============================================================================

import { supabase } from "@/lib/supabase";
import type { Memory } from "@/types/memory";

/**
 * Insert a new memory row in PENDING state. Returns the new id.
 * Called by POST /api/memories after the photo is uploaded to Storage.
 */
export async function createMemory(input: {
  description: string;
  inputKeys: string[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("memories")
    .insert({
      description: input.description,
      input_keys: input.inputKeys,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Fetch one memory (for the browser's status poll). Returns null if not found. */
export async function getMemory(id: string): Promise<Memory | null> {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Memory | null;
}

/** List recent memories (optional gallery page). */
export async function listMemories(): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as Memory[];
}

// NOTE: status/progress/splat_url UPDATES are written by the GPU pipeline
// (pipeline/db.py), not here. The backend only creates + reads.
