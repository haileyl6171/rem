// ============================================================================
//  Supabase client — SERVER ONLY.
//  Owned by P2. Imported only by other files in src/lib/ and by route handlers
//  (which run on the server). Never import this from a "use client" component.
// ============================================================================

import "server-only"; // hard guard: build fails if this is bundled to the client
import { createClient } from "@supabase/supabase-js";

// NOTE: add the dep first →  npm i @supabase/supabase-js

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // Fail loud at startup rather than producing confusing runtime errors.
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example",
  );
}

/**
 * Service-role client: full DB + Storage access, bypasses RLS.
 * Safe ONLY on the server. This is what db.ts and storage.ts use.
 */
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const MEMORIES_BUCKET = "memories";
